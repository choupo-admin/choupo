#!/usr/bin/env python3
"""One structural guard for the six per-file electrolyte record populations.

What was wrong: seven near-identical migration-era gates each read a retired
monolith under data/standards/electrolyte/ as their first act and exited 0,
leaving every later arm unreachable (found 2026-08-22); rewritten that day as
seven clones of one 60-line shape -- ~630 lines for one job.  This file is
the seven collapsed into one, same coverage, six fewer files (Gall rule,
2026-08-23).

What it checks, per population: the retired monolith stays ABSENT (a
resurrected one is a second home that drifts), every record carries its
recordType, required fields and a source citation, and a collapsed scan
(count under the floor) refuses instead of describing nothing.  Plus the
minerals arm: the mineralSolubility KIND stays retired -- dissolution data
lives in the owning component's solidPhases{} block.
"""
import re, sys
from pathlib import Path

repo = Path(__file__).resolve().parents[2]
std = repo / "data/standards"
fails = []

# label, retired monolith, dirs, select-token, required (regex, meaning), floor
POPS = [
 ("pitzer-pairs", "pairs.dat", ["parameters/Pitzer/pairs"], None,
  [("recordType electrolytePairParameters", "recordType"),
   (r"\bbeta0\b", "a beta0 value"), (r'source\s+"', "a source citation")], 40),
 ("pitzer-mixing", "mixing.dat",
  ["parameters/Pitzer/theta", "parameters/Pitzer/psi",
   "parameters/Pitzer/lambda", "parameters/Pitzer/zeta"], None,
  [("recordType electrolyteMixingParameter", "recordType"),
   (r'source\s+"', "a source citation")], 45),
 ("eNRTL", "enrtl.dat", ["parameters/eNRTL"], None,
  [("recordType electrolyteNRTLParameters", "recordType"),
   (r"\btau_m_ca\b", "tau_m_ca"), (r"\btau_ca_m\b", "tau_ca_m"),
   (r"\balpha\b", "alpha"), (r'source\s+"', "a source citation")], 2),
 ("speciation", "speciation.dat", ["chemistry"],
  "recordType aqueousSpeciation",
  [(r"\blogK25\b", "a logK25"), (r'source\s+"', "a source citation")], 45),
 ("gas-liquid", "gases.dat", ["chemistry"],
  "recordType gasLiquidEquilibrium",
  [("schemaVersion 2", "schemaVersion 2"),
   (r"\bgasSpecies\b", "a typed gasSpecies"),
   (r"\bdissolvedSpecies\b", "a typed dissolvedSpecies"),
   (r"\blogK25\b", "a logK25"), (r'source\s+"', "a source citation")], 6),
 ("ion-exchange", "exchange.dat", ["chemistry"],
  "recordType ionExchangeEquilibrium",
  [(r"\blogK25\b", "a logK25"), (r"\bmasters\b", "a masters block"),
   (r'source\s+"', "a source citation")], 4),
]

counts = {}
for label, mono, dirs, select, required, floor in POPS:
    m = std / "electrolyte" / mono
    if m.exists():
        fails.append(f"{label}: {m} EXISTS again -- the kind was consolidated"
                     " into per-file records; a monolith is a second home")
    n = 0
    for d in dirs:
        base = std / d
        if not base.is_dir():
            fails.append(f"{label}: record home data/standards/{d} is MISSING")
            continue
        for f in sorted(base.glob("*.dat")):
            txt = f.read_text(encoding="utf-8", errors="replace")
            if select and select not in txt:
                continue
            n += 1
            for pat, meaning in required:
                if not re.search(pat, txt):
                    fails.append(f"{f.relative_to(repo)}: missing {meaning}")
    if n < floor:
        fails.append(f"{label}: only {n} record(s) scanned (floor {floor})"
                     " -- collapsed scan")
    counts[label] = n

# minerals: the retired kind stays retired
if (std / "electrolyte/minerals.dat").exists():
    fails.append("electrolyte/minerals.dat EXISTS again -- mineral"
                 " dissolution data lives in the component's solidPhases{}")
chem = std / "chemistry"
if chem.is_dir():
    for f in sorted(chem.glob("*.dat")):
        if "recordType mineralSolubility" in f.read_text(encoding="utf-8",
                                                         errors="replace"):
            fails.append(f"{f.relative_to(repo)}: resurrects the RETIRED"
                         " mineralSolubility kind (no reader exists)")

if fails:
    print("electrolyte-records GATE FAILED:")
    for x in fails[:40]:
        print("  -", x)
    sys.exit(1)
print("electrolyte-records: OK -- monoliths absent, "
      + ", ".join(f"{v} {k}" for k, v in counts.items())
      + " record(s) structurally sound; the mineralSolubility kind stays"
      " retired.")
