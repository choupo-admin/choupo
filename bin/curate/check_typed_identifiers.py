#!/usr/bin/env python3
"""Typed-identifier gate -- the compiler owns the rule; this guards the shortcuts.

The 2026-07-25 three-way decision: ComponentId / SpeciesId / SolidId are strong
types with NO implicit conversion, so a component index cannot become a species
key without passing the ONE declared bridge (AqueousChemistry::aqueousMapping,
each component's `aqueousMapping` block or its `dissociatesTo` converted at
load).  The compiler enforces the signatures; what it cannot see is a human
LAUNDERING a crossing through the public `.key` / `.name()` spellings.  This
gate refuses those shortcuts:

  1. no unit-op source constructs SpeciesId from a component's name
     (`SpeciesId(thermo.comp(...).name())` and friends);
  2. no unit-op source indexes a species-space map with `.name()` directly;
  3. every case that runs an aqueous-bridge unit (spiralWoundModule scaling,
     electrodialysisStack, ionExchanger) declares the bridge on each ionic
     component record -- `aqueousMapping` or `dissociatesTo` -- so the refusal
     never fires at a student mid-run;
  4. the historic crossing sites stay dead: `totals[thermo.comp` and
     `ionCharge/ionD0/ionRadius` on a bare string.

Exit 1 on any violation.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
UNITS = ROOT / "src" / "unitOperations"

bad = []

LAUNDER = re.compile(
    r'SpeciesId\s*\(\s*(thermo\.)?comp\w*\s*\([^)]*\)\s*\.name\(\)|'
    r'SpeciesId\s*\{\s*(thermo\.)?comp\w*\s*\([^)]*\)\s*\.name\(\)|'
    r'totals\s*\[\s*(thermo\.)?comp\w*\s*\([^)]*\)\s*\.name\(\)|'
    r'\bion(Charge|D0|Radius)\s*\(\s*"'
)

for f in sorted(list(UNITS.rglob("*.cpp")) + list(UNITS.rglob("*.H"))):
    inComment = False
    for i, line in enumerate(f.read_text(errors="replace").splitlines(), 1):
        if inComment:
            if "*/" in line:
                inComment = False
            continue
        if "/*" in line and "*/" not in line:
            inComment = True
            continue
        if line.lstrip().startswith("//"):
            continue
        if LAUNDER.search(line):
            bad.append(f"{f.relative_to(ROOT)}:{i}: launders a component name"
                       f" into species space -- cross through the declared"
                       f" bridge (aqueousChemistry().singleMaster /"
                       f" aqueousMapping), never by spelling")

# ---- 3. bridge declared in every case that needs it ------------------------
BRIDGE_UNITS = re.compile(r'\b(spiralWoundModule|electrodialysisStack|ionExchanger)\b')
IONIC = {"Ca", "Mg", "Na", "K", "Cl", "SO4", "HCO3"}
nCases = 0
for fs in sorted((ROOT / "tutorials").rglob("system/flowsheetDict")):
    txt = re.sub(r'/\*.*?\*/', '', fs.read_text(errors="replace"), flags=re.S)
    txt = re.sub(r'//.*$', '', txt, flags=re.M)
    if not BRIDGE_UNITS.search(txt):
        continue
    # scaling-free spiralWoundModule cases don't speciate -> no bridge needed
    if "spiralWoundModule" in txt and "scaling" not in txt \
            and "electrodialysisStack" not in txt and "ionExchanger" not in txt:
        continue
    case = fs.parent.parent
    comp = case / "constant" / "components"
    if not comp.is_dir():
        continue
    nCases += 1
    for p in sorted(comp.glob("*.dat")):
        if p.stem not in IONIC:
            continue
        t = p.read_text(errors="replace")
        if "aqueousMapping" not in t and "dissociatesTo" not in t:
            bad.append(f"{case.relative_to(ROOT)}: ionic component"
                       f" '{p.stem}' declares no aqueousMapping /"
                       f" dissociatesTo -- the bridge refusal would fire"
                       f" mid-run")

if bad:
    print("typed-identifier gate FAILED:")
    for b in bad:
        print("  " + b)
    sys.exit(1)

print(f"typed-identifier gate: no laundered crossings in unit ops;"
      f" {nCases} bridge-unit case(s) declare their component->species"
      f" mappings")
sys.exit(0)
