#!/usr/bin/env bash
# Probe: sprayDryer01 with the crystal density removed from the case's own (sealed,
# mirrored) sucrose record.  Does the unit refuse, announce, or assume a value?
# Run from the repository root after `make all`:
#     bash docs/reviews/2026-11-12-solid-properties/probe_spraydryer_density.sh <scratchDir>
set -u
ROOT=$(pwd); OUT=${1:?scratch dir}; mkdir -p "$OUT"; HERE=$ROOT/docs/reviews/2026-11-12-solid-properties
source etc/bashrc >/dev/null 2>&1
for v in base noRho; do
  C=$OUT/sd_$v; rm -rf "$C"; cp -r tutorials/steady/drying/sprayDryer01_sugar "$C"; rm -f "$C"/log.*
  sed -i 's/type          imported;/type          adopted;/' "$C/constant/propertyManifest"
  [ $v = noRho ] && python3 -I "$HERE/probe_remove_block.py" "$C/constant/components/sucrose.dat" solid
  (cd "$C" && choupoSolve > run.log 2>&1; echo "== $v exit $?")
  grep -nE "particle d_p|rho_p|1500|density|ERROR" "$C/run.log" | head -6
  grep -oE '"d_particle_micron": [0-9.e+-]+' "$C/run.log" | head -1
done
