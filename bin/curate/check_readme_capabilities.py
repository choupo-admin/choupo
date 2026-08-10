#!/usr/bin/env python3
"""Gate: the README's CAPABILITY MATRIX names every model the engine registers.

    bin/curate/check_readme_capabilities.py

WHY THIS EXISTS.  An outside reader assessed the public surface on
2026-08-10 and found the README internally contradictory: the prose
claimed four binaries, SRK + Peng-Robinson and substantial solids, while
the tables below it still said three binaries, `Equation of state:
idealGas`, and `solid (stub)`.  Their objection is the one that matters
and is quoted here because it is the gate's whole purpose:

    "If the EOS line is stale, how many other capability claims are
     stale too?"

Six rows were stale, not the three they spotted (activity models, Psat,
Cp and the outer drivers had drifted as well).  A capability table is a
CLAIM ABOUT THE ENGINE, and unlike free prose it has a machine-checkable
counterpart: the factory registries.  So this gate compares the two.

WHAT IT CHECKS -- for each factory, every registered key must appear
somewhere in the README's capability matrix:

    activity models   src/thermo/activityCoefficient/ActivityModel.cpp
    equations of state src/thermo/equationOfState/EquationOfState.cpp
    vapour pressure   src/thermo/vaporPressure/VaporPressureModel.cpp
    heat capacity     src/thermo/heatCapacity/HeatCapacityModel.cpp
    outer drivers     src/outerDriver/OuterDriver.cpp

plus every binary under src/applications/.

WHAT IT DOES **NOT** CHECK, stated so the green line cannot imply it:

  * the CONVERSE -- a README naming a model the engine does not register
    would pass here.  Deliberate: the matrix legitimately names sub-models
    and aliases that are not factory keys (`FUG`, `membraneSW`, Watson),
    and a gate that banned unknown words would fight the prose instead of
    the drift.  Overclaiming is caught by review, underclaiming by this.
  * whether a named capability WORKS.  That is the corpus's job, not a
    text comparison's.
  * unit operations.  UnitOperation registers ~50 types and the matrix
    groups them by function rather than listing keys, so a key-by-key
    demand would be noise.  Named as a blind spot rather than faked.
  * every other document.  Prose staleness in general is deliberately NOT
    gated (three earlier attempts failed three ways -- a text search
    cannot tell a live claim from a recorded one).  A CAPABILITY TABLE is
    the narrow, tractable exception: fixed rows, machine-readable keys.

SABOTAGE-VERIFIED 2026-08-10, and the OBSERVED output is recorded here
rather than the output that was expected.

Sabotage -- the EOS row reverted to its stale text (`idealGas` alone):

    check_readme_capabilities: FAILED
      equation of state: the engine registers 'PCSAFT', 'PR',
      'PengRobinson', 'SRK' but the README capability matrix never names
      them -- a capability table is a claim about the engine, and a stale
      row makes a reader doubt every other row (the 2026-08-10 finding).

Restored; the gate passed again.

The sabotage also caught THIS GATE's first draft.  It matched with a plain
substring test, so 'PR' came back PRESENT -- found inside "MSMPR" in the
crystalliser row -- and a stale EoS row would have concealed one of its own
models from the very check meant to expose it.  Matching is now
word-bounded, and the recorded failure above is the output AFTER that fix
(the first draft printed the same line without 'PR').
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

#  The matrix is the table region: from the capability heading to the next
#  top-level heading.  Reading the WHOLE README would let an unrelated
#  mention elsewhere satisfy a row, which is precisely the drift.
readme = open(os.path.join(ROOT, "README.md"), encoding="utf-8").read()
m = re.search(r"^##\s+Capability matrix\s*$(.*?)^##\s", readme, re.S | re.M)
if not m:
    print("check_readme_capabilities: FAILED")
    print("  README has no '## Capability matrix' section -- the gate's subject")
    print("  is gone.  Restore the section, or retire this gate deliberately;")
    print("  a gate whose subject vanished must not report PASS.")
    sys.exit(1)
matrix = m.group(1)

BINARIES = sorted(os.listdir(os.path.join(ROOT, "src", "applications")))

FACTORIES = [
    ("activity model", "src/thermo/activityCoefficient/ActivityModel.cpp",
     r'registerModel\("([A-Za-z0-9]+)"'),
    ("equation of state", "src/thermo/equationOfState/EquationOfState.cpp",
     r'reg\w*\("([A-Za-z0-9]+)"'),
    ("vapour pressure", "src/thermo/vaporPressure/VaporPressureModel.cpp",
     r'reg\w*\("([A-Za-z0-9]+)"'),
    ("heat capacity", "src/thermo/heatCapacity/HeatCapacityModel.cpp",
     r'reg\w*\("([A-Za-z0-9]+)"'),
    ("outer driver", "src/outerDriver/OuterDriver.cpp",
     r'reg\w*\("([A-Za-z0-9]+)"'),
]

fails = []

for label, rel, pat in FACTORIES:
    path = os.path.join(ROOT, rel)
    if not os.path.exists(path):
        fails.append(f"{label}: {rel} is missing -- the gate cannot read the "
                     f"registry it compares against, and a check that cannot "
                     f"run must not pass")
        continue
    keys = sorted(set(re.findall(pat, open(path, encoding="utf-8").read())))
    #  WORD BOUNDARIES, not substrings.  A plain `k in matrix` finds a short
    #  key inside an unrelated word -- the first draft of this gate reported
    #  'PR' as PRESENT because the crystalliser row says "MSMPR", so a stale
    #  EoS row would have hidden one of its own models from the sabotage that
    #  was meant to prove the gate works.  (check_solid_service paid for the
    #  same lesson at its A6 arm.)
    missing = [k for k in keys
               if not re.search(rf"(?<![A-Za-z0-9]){re.escape(k)}(?![A-Za-z0-9])",
                                matrix)]
    if missing:
        fails.append(
            f"{label}: the engine registers "
            + ", ".join(f"'{k}'" for k in missing)
            + " but the README capability matrix never names them -- a"
              " capability table is a claim about the engine, and a stale row"
              " makes a reader doubt every other row (the 2026-08-10 finding).")

#  The binaries are claimed in their own table; check the whole README for
#  those (the count sentence and the table are separate places, both must
#  know about a new binary).
missing_bin = [b for b in BINARIES if b not in readme]
if missing_bin:
    fails.append("binaries: " + ", ".join(missing_bin)
                 + " are built under src/applications but the README never"
                   " names them")

if fails:
    print("check_readme_capabilities: FAILED")
    for f in fails:
        print("  " + f)
    sys.exit(1)

print("check_readme_capabilities: OK -- every model key the engine registers"
      f" (activity, EoS, Psat, Cp, outer drivers) and all {len(BINARIES)}"
      " binaries are named in the README.  NOT CHECKED: the converse (a"
      " README naming something unregistered passes -- the matrix"
      " legitimately carries aliases and sub-models), whether any named"
      " capability WORKS, unit-operation keys (grouped by function by"
      " design), and prose outside the capability matrix.")
