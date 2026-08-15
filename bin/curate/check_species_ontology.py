#!/usr/bin/env python3
"""Model-species ontology gate (Codex P0-semantico, 2026-07-18).

The aqueous monolith dismantled into flat recordType modelSpecies files.
Two invariants a reader/consumer relies on:
  1. a NEUTRAL species (charge 0) is NOT an ion -- its record must carry
     `formula`, never the `ion` key (O2(aq)/N2(aq) are dissolved molecules);
  2. every species/<name>.dat is recordType modelSpecies with a formula.
Exit 1 on any violation.
"""
import re
import sys
from pathlib import Path

STD = Path(__file__).resolve().parents[2] / "data" / "standards" / "species"

# A scan over nothing is not an ontology (2026-08-15 fleet census): this
# gate shared the check_true_ions death shape -- rename the species root and
# glob returns nothing, zero violations over zero records, and the gate goes
# permanently green.  A scanner must refuse when it cannot see its subjects.
if not STD.is_dir():
    print("SPECIES ONTOLOGY GATE FAILED: scan root 'data/standards/species'"
          " does not exist -- this gate cannot see what it audits, and a"
          " green verdict over an absent tree would be the check_true_ions"
          " failure again.")
    sys.exit(1)

bad = []
n = 0
scanned = 0
for f in sorted(STD.glob("*.dat")):
    scanned += 1
    if f.name == "aqueous.dat":
        bad.append(f"{f.name}: the retired monolith must not exist")
        continue
    txt = re.sub(r'/\*.*?\*/', '', f.read_text(), flags=re.S)
    txt = re.sub(r'^\s*//.*$', '', txt, flags=re.M)
    if not re.search(r'\brecordType\s+modelSpecies\b', txt):
        bad.append(f"{f.name}: not recordType modelSpecies")
        continue
    n += 1
    if not re.search(r'\bformula\s+"', txt):
        bad.append(f"{f.name}: no `formula` identity field")
    m = re.search(r'\bcharge\s+([+\-]?\d+)\b', txt)
    charge = int(m.group(1)) if m else 0
    if charge == 0 and re.search(r'^\s*ion\s+"', txt, re.M):
        bad.append(f"{f.name}: NEUTRAL (charge 0) carries an `ion` key"
                   " -- a dissolved molecule is not an ion")

# Collapsed-scan floor (2026-08-15 fleet census, check_true_ions precedent):
# 52 species files observed; the floor sits a round 5x+ below.
if scanned < 10:
    print(f"SPECIES ONTOLOGY GATE FAILED: only {scanned} species file(s)"
          f" scanned -- the catalogue holds dozens, so the scan surface has"
          f" collapsed and a verdict over it would describe nothing.")
    sys.exit(1)

if bad:
    print("SPECIES ONTOLOGY GATE FAILED:")
    for b in bad:
        print("  " + b)
    sys.exit(1)
print(f"species ontology: {n} modelSpecies files, formula-typed,"
      f" neutrals not mislabelled as ions ({scanned} files scanned; an"
      f" absent or collapsed scan root REFUSES)")
