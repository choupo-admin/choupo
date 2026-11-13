#!/bin/bash
# probe_entry_callers.sh <repo root> <scratch dir>
# Copies src/ and check_liquid_density_entry_callers.py into a scratch tree,
# adds a new unit file that calls the pilot's entry WITHOUT the
# `liquidProperty::` qualifier (a using-declaration and a using-directive),
# and runs the gate there.  The gate's docstring says an unqualified
# `density(` inside liquidProperty code is counted; its regex does not.
set -u
ROOT=$(cd "$1" && pwd); S=$(mkdir -p "$2" && cd "$2" && pwd)/entry_callers
rm -rf "$S"; mkdir -p "$S/bin/curate"
cp -r "$ROOT/src" "$S/src"
cp "$ROOT/bin/curate/check_liquid_density_entry_callers.py" "$S/bin/curate/"
echo "== baseline (unmodified copy)"
python3 "$S/bin/curate/check_liquid_density_entry_callers.py" | head -2
cat > "$S/src/unitOperations/rotating/ProbeUnitA.cpp" <<'EOF'
#include "thermo/LiquidPropertyDoor.H"
namespace Choupo {
using liquidProperty::density;
double probeA(const liquidProperty::Request& q) { return density(q).value; }
}
EOF
cat > "$S/src/unitOperations/rotating/ProbeUnitB.cpp" <<'EOF'
#include "thermo/LiquidPropertyDoor.H"
namespace Choupo { namespace liquidProperty {
double probeB(const Request& q) { return density(q).value; }
} }
EOF
echo "== with two unqualified callers added (ProbeUnitA.cpp, ProbeUnitB.cpp)"
python3 "$S/bin/curate/check_liquid_density_entry_callers.py" | head -2
echo "exit $?"
