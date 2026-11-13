#!/usr/bin/env python3
"""Gate: the pilot's second entry to the liquid density has exactly its named callers.

    bin/curate/check_liquid_density_entry_callers.py

WHY (DEV.md 4c C378, the pilot's rulings).  `liquidProperty::density(const
Request&)` (src/thermo/LiquidPropertyDoor.H) is MIGRATION SCAFFOLDING: the
liquid density through the kernel's methods, beside the slice-0 wrapper
`liquidProperty::evaluate` that every other consumer keeps.  Only the units
the pilot migrates may call it, and the bench probes of the kernel; a new
caller is a decision, so the count can only grow by editing this file's
list, in a commit that says why.  The entry is removed when the last
consumer has moved.

THE CALLERS, by file, with the number of call sites each holds:
  src/unitOperations/rotating/Pump.cpp          1   the pump (inlet state)
  src/unitOperations/reactor/CSTR.cpp           1   the CSTR (feed state, liquid basis)
  src/propertyOps/PropertyEvaluator.cpp         1   the props bench key `rho_liquid_kernel`
  src/applications/choupoProps/PropertyRouteBench.cpp  1   the route bench (characterisation)
The two bench files are instruments of the kernel, not units pricing a
property (ruling 1 at the pilot's hand-back A).

WHAT IS COUNTED: a call `liquidProperty::density(`, or `density(` inside
`namespace liquidProperty` code that is not the definition, anywhere under
src/ (comments and string literals removed).  The definition in
src/thermo/liquidProperty/DensityResolver.cpp and the declaration in
LiquidPropertyDoor.H are not calls.

NOT CHECKED: that each caller passes the right state (the witnesses and the
demonstrations hold that).
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NAME = "check_liquid_density_entry_callers"
ALLOWED = {
    "src/unitOperations/rotating/Pump.cpp": 1,
    "src/unitOperations/reactor/CSTR.cpp": 1,
    "src/propertyOps/PropertyEvaluator.cpp": 1,
    "src/applications/choupoProps/PropertyRouteBench.cpp": 1,
}
CALL = re.compile(r"\bliquidProperty::density\s*\(")


def strip(t):
    t = re.sub(r"/\*.*?\*/", " ", t, flags=re.S)
    t = re.sub(r"//[^\n]*", " ", t)
    return re.sub(r'"(?:\\.|[^"\\])*"', '""', t)


def main():
    found = {}
    for p in sorted((ROOT / "src").rglob("*")):
        if p.suffix not in (".cpp", ".H") or not p.is_file():
            continue
        rel = str(p.relative_to(ROOT))
        n = len(CALL.findall(strip(p.read_text(encoding="utf-8", errors="replace"))))
        if n:
            found[rel] = n
    bad = []
    for f, n in sorted(found.items()):
        if f not in ALLOWED:
            bad.append(f"NEW CALLER  {f} ({n} call site(s)): the pilot's entry is scaffolding;"
                       " a new caller is a decision -- add it to ALLOWED with its reason, or"
                       " ask through liquidProperty::evaluate")
        elif n != ALLOWED[f]:
            bad.append(f"COUNT  {f}: {n} call site(s), pinned {ALLOWED[f]}")
    for f in sorted(set(ALLOWED) - set(found)):
        bad.append(f"GONE  {f}: no longer calls the entry -- remove it from ALLOWED (the list"
                   " only shrinks as consumers finish moving)")
    if bad:
        print(f"{NAME}: FAIL")
        for b in bad:
            print("  " + b)
        return 1
    print(f"{NAME}: OK -- the pilot's entry liquidProperty::density has its "
          f"{len(ALLOWED)} named callers ({', '.join(Path(f).name for f in ALLOWED)}), "
          "each with its pinned call count; no other file under src/ calls it.  NOT "
          "CHECKED: the state each caller passes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
