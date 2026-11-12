#!/usr/bin/env bash
# Probe: run mill01 (CaCO3 solid) with the solid heat capacity, then the formation
# datum, removed from the case's own (sealed, mirrored) CaCO3 record.
# Run from the repository root after `make all`:
#     bash docs/reviews/2026-11-12-solid-properties/probe_mill_datum.sh <scratchDir>
# Writes <scratchDir>/{base,noCp,noHf}/ and prints the lines that matter.
set -u
ROOT=$(pwd); OUT=${1:?scratch dir}; mkdir -p "$OUT"; HERE=$ROOT/docs/reviews/2026-11-12-solid-properties
source etc/bashrc >/dev/null 2>&1
for v in base noCp noHf; do
  rm -rf "$OUT/$v"; cp -r tutorials/steady/solids/mill01_limestone_herbstFuerstenau "$OUT/$v"
  rm -f "$OUT/$v"/log.*
  rec="$OUT/$v/constant/components/CaCO3.dat"
  # the probe record is ADOPTED (not hash-enforced) so the edit runs under the seal
  sed -i 's/type          imported;/type          adopted;/' "$OUT/$v/constant/propertyManifest"
  case $v in
    noCp) python3 -I "$HERE/probe_remove_block.py" "$rec" solidHeatCapacity ;;
    noHf) python3 -I "$HERE/probe_remove_block.py" "$rec" standardThermochemistry ;;
  esac
  (cd "$OUT/$v" && choupoSolve > run.log 2>&1; echo "== $v exit $?")
  grep -nE "T_out:|solidHeatCapacity|Cp_liquid|h_formation|standardThermochemistry|UNAVAILABLE|REFUSED|Error|error" "$OUT/$v/run.log" | head -12
  grep -h "^mill," "$OUT/$v/reports/balances/energyBalance_byUnit.csv" 2>/dev/null | head -1
done
