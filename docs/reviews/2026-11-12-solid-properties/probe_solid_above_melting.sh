#!/usr/bin/env bash
# Probe: a solids-only stream of crystalline sucrose (melts/decomposes near 459 K;
# no melting temperature exists in the record grammar) mixed adiabatically at
# 300 K and 520 K.  Is the crystal priced as a solid at 520 K, and what is said?
# Run from the repository root after `make all`:
#     bash docs/reviews/2026-11-12-solid-properties/probe_solid_above_melting.sh <scratchDir>
set -u
OUT=${1:?scratch dir}; C=$OUT/hot_sucrose; mkdir -p "$C/system" "$C/constant" "$C/0"
source etc/bashrc >/dev/null 2>&1
cp tutorials/steady/solids/mill01_limestone_herbstFuerstenau/system/controlDict "$C/system/"
touch "$C/hot.cho"; rm -f "$C"/log.* "$C/run.log"
cat > "$C/constant/thermoPhysPropDict" <<'D'
recordType    thermophysicalPropertySystem;
schemaVersion 2;
components ( sucrose );
equilibrium
{
    formulation gammaPhi;
    liquid  { activityModel ideal; standardState pureLiquid; }
    vapour  { fugacityModel idealGas; }
}
D
echo 'units ( { name mix; type mixer; inputs ( A B ); outputs ( M ); } );' > "$C/system/flowsheetDict"
for s in A:300 B:520 M:400; do n=${s%%:*}; T=${s##*:}
cat > "$C/0/$n" <<D
componentMolarFlows { sucrose 1 kmol/h; }
T $T K; P 101325 Pa;
phases { solid { componentMolarFlows { sucrose 1 kmol/h; } } }
D
done
(cd "$C" && choupoSolve > run.log 2>&1; echo "exit $?")
grep -niE "T_out|Trange|extrapolat|melt|fusion|ERROR|sucrose" "$C/run.log" | grep -v "^\s*[0-9]*:\s*\"" | head -12
