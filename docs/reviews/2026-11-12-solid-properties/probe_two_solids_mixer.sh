#!/usr/bin/env bash
# Probe: an adiabatic mixer of two SOLID-ONLY streams carrying two different solid
# components (silica at 300 K, CaCO3 at 400 K) -- is the outlet a mechanical mixture
# (mass and enthalpy add)?  Built from mill01's controlDict + package, unsealed so
# the catalogue records of silica and CaCO3 are read.
# Run from the repository root after `make all`:
#     bash docs/reviews/2026-11-12-solid-properties/probe_two_solids_mixer.sh <scratchDir> [psdB]
# psdB = "same" (default: both inlets on one grid) or "nopsd" (inlet B declares none).
set -u
ROOT=$(pwd); OUT=${1:?scratch dir}; MODE=${2:-same}; C=$OUT/mix2solids_$MODE
source etc/bashrc >/dev/null 2>&1
rm -rf "$C"; mkdir -p "$C/system" "$C/constant" "$C/0"
cp tutorials/steady/solids/mill01_limestone_herbstFuerstenau/system/controlDict "$C/system/"
sed -i 's/^description .*/description "probe: two solids mixed";/' "$C/system/controlDict"
touch "$C/mix2solids.cho"
cat > "$C/constant/thermoPhysPropDict" <<'D'
recordType    thermophysicalPropertySystem;
schemaVersion 2;
components ( silica CaCO3 );
equilibrium
{
    formulation gammaPhi;
    liquid  { activityModel ideal; standardState pureLiquid; }
    vapour  { fugacityModel idealGas; }
}
D
cat > "$C/system/flowsheetDict" <<'D'
units
(
    { name mix; type mixer; inputs ( A B ); outputs ( M ); }
);
D
psdA='particleSizeDistribution { edges ( 1e-4 2e-4 4e-4 ); diameter ( 1.414e-4 2.828e-4 ); massFrac ( 0.5 0.5 ); }'
psdB="$psdA"; [ "$MODE" = nopsd ] && psdB=''
cat > "$C/0/A" <<D
componentMolarFlows { silica 1 kmol/h; CaCO3 0 kmol/h; }
T 300 K; P 101325 Pa;
phases { solid { componentMolarFlows { silica 1 kmol/h; } $psdA } }
D
cat > "$C/0/B" <<D
componentMolarFlows { silica 0 kmol/h; CaCO3 1 kmol/h; }
T 400 K; P 101325 Pa;
phases { solid { componentMolarFlows { CaCO3 1 kmol/h; } $psdB } }
D
cat > "$C/0/M" <<D
componentMolarFlows { silica 1 kmol/h; CaCO3 1 kmol/h; }
T 350 K; P 101325 Pa;
phases { solid { componentMolarFlows { silica 1 kmol/h; CaCO3 1 kmol/h; } $psdA } }
D
(cd "$C" && choupoSolve > run.log 2>&1; echo "exit $?")
grep -nE "SOLIDS ONLY|Solids out|T_out|result|Q |psd|ERROR|refus|density|\[mixer\]" "$C/run.log" | head -25
cat "$C/reports/balances/energyBalance_byUnit.csv" 2>/dev/null | head -2
