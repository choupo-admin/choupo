#!/usr/bin/env python3
"""Post-consolidation guard for the Pitzer binary cation-anion pair records.

Two arms, both of which can FAIL:
(1) the retired monolith data/standards/electrolyte/pairs.dat must stay
    ABSENT -- its reintroduction would resurrect a second home for facts the
    per-file corpus now owns (the arity sin);
(2) every per-file record is structurally sound: it declares its recordType
    and carries recordType electrolytePairParameters, a beta0 value, a source "..." citation.
A collapsed scan (fewer than 40 records where the 2026-08-22 census
found 55) REFUSES instead of describing nothing.

History: until 2026-08-22 this gate was a migration-faithfulness guard whose
first act was to read the monolith; when the monolith was retired the gate
began exiting 0 at that test with EVERY later arm unreachable -- a
permanently-green gate, the check_true_ions shape.  Found by the fresh-eyes
audit (docs/audit/2026-08-22-fresh-eyes/); this rewrite is the flip to
"assert ABSENT" that the old docstring promised and never performed, plus
the structural arm the migration's completion left possible.
"""
import re, sys
from pathlib import Path

repo = Path(__file__).resolve().parents[2]
monolith = repo / "data/standards/electrolyte/pairs.dat"
fails = []

# -- arm 1: the monolith stays retired ---------------------------------------
if monolith.exists():
    fails.append(f"{monolith} EXISTS again -- the Pitzer binary cation-anion pair kind was"
                 " consolidated into per-file records; a resurrected monolith"
                 " is a second home that will silently drift (arity, I1)")

# -- arm 2: structural soundness of the per-file corpus ----------------------
DIRS = ['parameters/Pitzer/pairs']
SELECT = None          # None = every .dat; else only records carrying it
REQUIRED = [('recordType electrolytePairParameters', 'recordType electrolytePairParameters'), ('\\bbeta0\\b', 'a beta0 value'), ('source\\s+"', 'a source "..." citation')]      # (regex, what a miss means)

n = 0
for d in DIRS:
    base = repo / "data/standards" / d
    if not base.is_dir():
        fails.append(f"record home data/standards/{d} is MISSING -- the scan"
                     " surface has collapsed")
        continue
    for f in sorted(base.glob("*.dat")):
        txt = f.read_text(encoding="utf-8", errors="replace")
        if SELECT and not re.search(SELECT, txt):
            continue
        n += 1
        for pat, meaning in REQUIRED:
            if not re.search(pat, txt):
                fails.append(f"{f.relative_to(repo)}: missing {meaning}"
                             f" (no match for {pat!r})")

if n < 40:
    fails.append(f"only {n} Pitzer binary cation-anion pair record(s) scanned (floor 40,"
                 f" census 55) -- a verdict over a collapsed scan"
                 " would describe nothing")

if fails:
    print("pitzer-pairs FAILED:")
    for x in fails[:40]:
        print("  -", x)
    sys.exit(1)
print(f"pitzer-pairs: OK -- monolith absent, {n} Pitzer binary cation-anion pair record(s) structurally"
      " sound (recordType + required fields + source).")
