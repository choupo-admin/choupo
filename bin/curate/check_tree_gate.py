#!/usr/bin/env python3
"""Tree gate (Migration 6, 2026-07-16): the retired data/standards homes must
never come back -- neither as src path-builders nor as resurrected dirs.

Retired homes (moved, one spelling everywhere):
  binaryPairs/ henrysLaw/          -> parameters/<MODEL>/   (Migration 2)
  propertyMethods/<family>/        -> methods/              (Migration 3)
  membranes/ materials/ adsorbents/ assets/resins/ -> assets/ flat (Migration 4)
  chemistry/{aqueousSpeciation,gasLiquid,ionExchange}/ -> chemistry/ flat (M5)

Exit 1 on any hit; runTests wires this next to the doctrine gate.
"""
import re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
bad = []

# A scan over nothing is not a clean tree (2026-08-15 fleet census): this
# gate shared the check_true_ions death shape -- rename a scanned root and
# rglob/is_dir return nothing, zero hits are found over zero subjects, and
# the gate goes permanently green.  Refuse when the root cannot be seen.
for root in ("src", "data/standards"):
    if not (ROOT / root).is_dir():
        print(f"TREE GATE FAILED: scan root '{root}' does not exist -- this"
              f" gate cannot see what it audits, and a green verdict over an"
              f" absent tree would be the check_true_ions failure again.")
        sys.exit(1)

# 1) src path-builders naming a retired home
pat = re.compile(r'"standards"\s*/\s*"(binaryPairs|henrysLaw|membranes|materials|adsorbents|propertyMethods)"')
scanned = 0
for f in (ROOT / "src").rglob("*.[cH]*"):
    if f.suffix not in (".cpp", ".H"):
        continue
    scanned += 1
    for i, line in enumerate(f.read_text(errors="replace").splitlines(), 1):
        if pat.search(line):
            bad.append(f"{f.relative_to(ROOT)}:{i}: retired path-builder: {line.strip()[:90]}")

# 2) resurrected dirs in the standards tree
std = ROOT / "data" / "standards"
for d in ("binaryPairs", "henrysLaw", "membranes", "materials", "adsorbents",
          "propertyMethods", "assets/resins", "chemistry/aqueousSpeciation",
          "chemistry/gasLiquid", "chemistry/ionExchange", "parameters/binary",
          "parameters/electrolyte/pitzer", "parameters/eos"):
    if (std / d).is_dir():
        bad.append(f"data/standards/{d}: retired home resurrected")

# Collapsed-scan floor (2026-08-15 fleet census, check_true_ions precedent):
# 628 src files observed; the floor sits a round 5x+ below.
if scanned < 100:
    print(f"TREE GATE FAILED: only {scanned} src files scanned -- the tree"
          f" holds hundreds, so the scan surface has collapsed and a verdict"
          f" over it would describe nothing.")
    sys.exit(1)

if bad:
    print("TREE GATE FAILED -- retired homes referenced/resurrected:")
    for b in bad:
        print("  " + b)
    sys.exit(1)
print(f"tree gate: retired homes stay retired ({scanned} src files scanned, "
      f"{len(list(std.iterdir()))} top-level homes; an absent or collapsed "
      f"scan root REFUSES)")
