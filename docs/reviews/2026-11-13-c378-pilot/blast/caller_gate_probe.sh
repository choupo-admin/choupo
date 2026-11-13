#!/bin/bash
# Adds two calls to liquidProperty::density in Valve.cpp (a namespace alias and a
# using-declaration), checks they compile and runs the caller gate, then restores.
# usage: caller_gate_probe.sh <repoRoot> <scratchDir>  (edits one source file, restored by git checkout)
set -u; R=$(cd "$1" && pwd); cd "$R" || exit 2
python3 - <<'PY'
p='src/unitOperations/valve/Valve.cpp'; s=open(p).read()
s=s.replace('#include "thermo/LiquidPropertyDoor.H"','#include "thermo/LiquidPropertyDoor.H"\nnamespace lpx = Choupo::liquidProperty;\ndouble c378a(const lpx::Request& q) { return lpx::density(q).value; }\nusing Choupo::liquidProperty::density;\ndouble c378b(const Choupo::liquidProperty::Request& q) { return density(q).value; }',1)
open(p,'w').write(s)
PY
g++ -std=c++17 -fsyntax-only -Isrc src/unitOperations/valve/Valve.cpp && echo COMPILES
bin/curate/check_liquid_density_entry_callers.py; echo "gate exit $?"
git checkout -- src/unitOperations/valve/Valve.cpp
echo "NOTE: the restored file is clock-newer; run make all before any suite."
