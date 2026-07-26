#!/usr/bin/env python3
"""Resolver-coherence gate: the aqueousSpeciation facts must not lie.

The ThermoResolver (ratified 2026-07-26) classifies components from
substance-level facts.  A fact that drifts from the data it summarises is
worse than no fact -- this gate holds the two together:

  1. VOCABULARY   -- `aqueousSpeciation` is `none` or a single word set name.
  2. SET => BRIDGE -- a component declaring a speciation SET must carry the
                     typed `aqueousMapping` bridge (the resolver derives the
                     family masters from it), and at least one standards
                     chemistry/ aqueousSpeciation record must reference one
                     of its mapped non-mediator species as a master.
  3. none => NO NETWORK -- a component declaring `none` must not carry a
                     bridge into charged/master species (that would BE
                     participation).
  4. PHASE PURITY -- vapour-phase equilibria (vapourDimerisation) never live
                     on aqueousSpeciation facts or aqueous chemistry records;
                     they stay on the gas-liquid records (spot check: no
                     `vapourDimerisation` inside recordType aqueousSpeciation).

Exit 1 on any violation.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STD = ROOT / "data" / "standards"

bad = []


def strip(t):
    t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
    return re.sub(r'//.*$', '', t, flags=re.M)


# masters referenced by standards aqueous speciation records
reaction_masters = set()
for p in (STD / "chemistry").glob("*.dat"):
    t = strip(p.read_text())
    if "recordType aqueousSpeciation" not in t:
        continue
    for m in re.finditer(r'\{\s*ion\s+(\S+)\s*;\s*nu\s+-?[\d.]+\s*;\s*\}', t):
        reaction_masters.add(m.group(1))
    if "vapourDimerisation" in t:
        bad.append(f"chemistry/{p.name}: vapour-phase dimerisation inside an"
                   f" aqueousSpeciation record -- vapour reactions live on the"
                   f" gas-liquid records (phase purity, ratified 2026-07-26)")

nFacts = nSets = 0
for p in sorted((STD / "components").glob("*.dat")):
    t = strip(p.read_text())
    spec = re.search(r'^\s*aqueousSpeciation\s+(\S+)\s*;', t, re.M)
    if not spec:
        continue
    nFacts += 1
    val = spec.group(1)
    if not re.match(r'^\w+$', val):
        bad.append(f"components/{p.name}: aqueousSpeciation '{val}' is not"
                   f" `none` or a single word set name")
        continue
    mapping = []
    m = re.search(r'aqueousMapping\s*\((.*?)\)\s*;', t, re.S)
    if m:
        mapping = re.findall(r'\{\s*species\s+(\S+)\s*;', m.group(1))
    if val == "none":
        if mapping:
            bad.append(f"components/{p.name}: declares `aqueousSpeciation"
                       f" none;` yet bridges into species"
                       f" ({', '.join(mapping)}) -- a bridge IS participation;"
                       f" one of the two facts is lying")
        continue
    nSets += 1
    if not mapping:
        bad.append(f"components/{p.name}: declares speciation set '{val}'"
                   f" without the typed aqueousMapping bridge -- the resolver"
                   f" cannot derive its family master")
        continue
    nonMediator = [s for s in mapping if s not in ("H", "OH")]
    if not any(s in reaction_masters for s in nonMediator):
        bad.append(f"components/{p.name}: speciation set '{val}' names no"
                   f" standards chemistry record referencing its mapped"
                   f" masters ({', '.join(nonMediator)}) -- the set is empty;"
                   f" curate the equilibria or fix the fact")

if bad:
    print("resolver-coherence gate FAILED:")
    for b in bad:
        print("  " + b)
    sys.exit(1)

print(f"resolver-coherence gate: {nFacts} aqueousSpeciation facts"
      f" ({nSets} sets, {nFacts - nSets} none), bridges + chemistry coverage"
      f" coherent; vapour reactions clean of aqueous records")
sys.exit(0)
