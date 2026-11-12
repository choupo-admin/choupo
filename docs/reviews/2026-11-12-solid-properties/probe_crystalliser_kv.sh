#!/usr/bin/env bash
# Probe: crystalliser08 (MSMPR, NaCl cubes, k_v 1.0) with the k_v line deleted
# from the case's own (sealed, mirrored) NaCl record.  Refused, announced, or assumed?
# Run from the repository root after `make all`:
#     bash docs/reviews/2026-11-12-solid-properties/probe_crystalliser_kv.sh <scratchDir>
set -u
OUT=${1:?scratch dir}; mkdir -p "$OUT"
source etc/bashrc >/dev/null 2>&1
for v in base noKv; do
  C=$OUT/cr_$v; rm -rf "$C"; cp -r tutorials/steady/crystallisation/crystalliser08_nacl_antisolvent_msmpr "$C"; rm -f "$C"/log.*
  sed -i 's/type          imported;/type          adopted;/' "$C/constant/propertyManifest"
  [ $v = noKv ] && sed -i '/^\s*k_v   1.0;/d' "$C/constant/components/NaCl.dat"
  (cd "$C" && choupoSolve > run.log 2>&1; echo "== $v exit $?")
  grep -c "k_v" "$C/constant/components/NaCl.dat"
  grep -niE "k_v|shape factor|sphere|ERROR" "$C/run.log" | head -5
  grep -oE '"(L_mean_um|L_mean|L43_um|L_d43|d43|L_32|L_dominant|magmaDensity|M_T|N_T|crystalYield)[^,]*' "$C/run.log" | head -8
done
