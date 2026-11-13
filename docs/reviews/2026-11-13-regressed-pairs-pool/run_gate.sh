#!/bin/bash
# usage: run_gate.sh <repo-root> <scratch-dir> <label> [JOBS]   (JOBS empty = default)
repo=$1; out=$2; label=$3; jobs=$4
cd "$repo" || exit 9
before=$(ls -d /tmp/choupo-* /tmp/vpgrade* /tmp/vpwin* /tmp/pairs-px* 2>/dev/null | sort)
start=$(date +%s.%N)
if [ -n "$jobs" ]; then export CHOUPO_GATE_JOBS=$jobs; else unset CHOUPO_GATE_JOBS; fi
unset CHOUPO_THREADS
python3 bin/curate/check_regressed_pairs.py > "$out/$label.log" 2> "$out/$label.err"
rc=$?
end=$(date +%s.%N)
after=$(ls -d /tmp/choupo-* /tmp/vpgrade* /tmp/vpwin* /tmp/pairs-px* 2>/dev/null | sort)
echo "label=$label jobs=${jobs:-default} rc=$rc wall=$(echo "$end - $start" | bc)" >> "$out/summary.txt"
comm -13 <(echo "$before") <(echo "$after") > "$out/$label.tmpleft"
git status --short > "$out/$label.gitstatus"
ls -d build/vpgrade-* build/vpwin-* 2>/dev/null >> "$out/$label.tmpleft"
