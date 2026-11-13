#!/bin/bash
# usage: subset_series.sh <repo-root> <scratch-dir> <prefix> <n> [jobs-list...]
repo=$1; out=$2; pre=$3; n=$4; shift 4
cd "$repo"
for j in "$@"; do for k in $(seq 1 $n); do
  label=${pre}_j${j}_$k
  if [ "$j" = def ]; then unset CHOUPO_GATE_JOBS; else export CHOUPO_GATE_JOBS=$j; fi
  unset CHOUPO_THREADS
  s=$(date +%s.%N)
  python3 "$out/subset_gate.py" "$repo" "$out" "$label" > "$out/$label.log" 2> "$out/$label.err"; rc=$?
  echo "$label rc=$rc wall=$(echo "$(date +%s.%N) - $s" | bc)" >> "$out/subset_summary.txt"
done; done
