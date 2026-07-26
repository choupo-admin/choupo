#!/usr/bin/env python3
"""The interim lexical-disambiguation rule -- why `aq` is not decoration.

Choupo's DATA identifiers are still bare strings (the C++ runtime is typed --
core/Identifiers.H -- but the records themselves key by spelling), and six of
the names an `aq` removal would produce already exist as feedable components:
CaCO3, CaSO4, CO2, NH3, MgSO4, NaHCO3.  While that is true, two different
chemical objects may not share a name, and the `aq` suffix is what keeps them
apart.  It is a functional disambiguator, not PHREEQC residue; removing it is
the F2 campaign, unlocked only now that the runtime typing is green, and
executed as a single closed transaction -- never piecemeal.

THE RULE IS NARROW, narrower than it first looks.  Sharing a name is only
wrong when the two are DIFFERENT OBJECTS:

  * a MASTER species (its own species/<id>.dat) sharing a component's name is
    the SAME substance in two phases -- dissolved CH4 and the CH4 component,
    O2, N2, H2, every ionic component.  That identity is intended and
    load-bearing (it is how an analysis reaches the speciation).  No suffix.

  * a DERIVED species (declared by a chemistry/ reaction record) sharing a
    component's name is a DIFFERENT object -- the neutral pair CaCO3(aq) is
    not the salt CaCO3 -- and MUST carry `aq`.

Checks:
  1. every derived neutral species homonymous with a component carries `aq`;
  2. `aq` is used only on a neutral (z = 0) species;
  3. INFORMATIONAL -- which suffixes shadow a component TODAY.  Deliberately
     not a failure: whether the shadow is live depends on which components a
     catalogue happens to carry, and coupling a NAME to unrelated catalogue
     state would be a new hidden coupling.  The suffix is uniform on neutral
     aqueous complexes; this only reports where it is load-bearing right now;
  4. no runtime code parses the suffix -- charge comes from `z`, never a name.

Retire this gate when the F2 data campaign lands typed record references.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STD = ROOT / "data" / "standards"
SRC = ROOT / "src"

bad = []

components = {p.stem for p in (STD / "components").glob("*.dat")}
masters = set()
for p in (STD / "species").glob("*.dat"):
    m = re.search(r'^name\s+(\S+);', p.read_text(), re.M)
    if m:
        masters.add(m.group(1))

derived = {}                       # id -> (z, file)
for p in sorted((STD / "chemistry").glob("*.dat")):
    t = p.read_text()
    if "recordType aqueousSpeciation" not in t:
        continue
    line = next((l for l in t.splitlines() if l.strip().startswith("species ")), "")
    s = re.search(r'species\s+(\S+);', line)
    z = re.search(r'\bz\s+([+-]?\d+)', line)
    if s:
        derived[s.group(1)] = (int(z.group(1)) if z else 0, p.name)

# ---- 1. a derived neutral homonymous with a component must carry `aq` ------
for sid, (z, f) in sorted(derived.items()):
    if sid in masters:
        continue                   # owns an identity file: the master case
    if z == 0 and sid in components:
        bad.append(f"chemistry/{f}: derived neutral species '{sid}' shares its"
                   f" name with the component '{sid}', which is a DIFFERENT"
                   f" object -- while record identifiers are bare strings it"
                   f" must be '{sid}aq' (the interim lexical-disambiguation"
                   f" rule)")

# ---- 2. `aq` only on a neutral species -------------------------------------
for sid, (z, f) in sorted(derived.items()):
    if sid.endswith("aq") and z != 0:
        bad.append(f"chemistry/{f}: '{sid}' carries the `aq` suffix but z ="
                   f" {z:+d}; `aq` marks a NEUTRAL aqueous species only")

# ---- 3. which suffixes currently shadow a component (INFORMATIONAL) --------
idle = [s for s in sorted(derived)
        if s.endswith("aq") and s[:-2] not in components]

# ---- 4. no runtime code parses the suffix ----------------------------------
PARSES = re.compile(r'(ends_with|endsWith|substr)\s*\(.*"aq"|"aq"\s*==|== *"aq"')
for f in list(SRC.rglob("*.cpp")) + list(SRC.rglob("*.H")):
    for i, line in enumerate(f.read_text(errors="replace").splitlines(), 1):
        if line.lstrip().startswith("//"):
            continue
        if PARSES.search(line):
            bad.append(f"{f.relative_to(ROOT)}:{i}: parses the `aq` suffix --"
                       f" charge and identity come from `z` and the record,"
                       f" never from a name")

if bad:
    print("aq-disambiguation gate FAILED:")
    for b in bad:
        print("  " + b)
    sys.exit(1)

nAq = sum(1 for s in derived if s.endswith("aq"))
print(f"aq-disambiguation gate: {nAq} neutral complexes carry `aq`"
      f" ({nAq - len(idle)} shadow a component TODAY, {len(idle)} are uniform"
      f" application); {len(masters & components)} master species share a"
      f" component name legitimately (same substance, two phases)")
sys.exit(0)
