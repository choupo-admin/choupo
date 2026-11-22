#!/bin/bash
# Micro-benchmark of the batch right-hand side and Jacobian on nox03 at the committed mid-ignition state.
# usage: bench.sh [N]     (best of five; needs `make all` and the g++ line at the top of test/rhs_bench.cpp)
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../.." && pwd)"
BIN="${BENCH_BIN:-$ROOT/build/linux64Gcc/rhs_bench}"
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
cp -r "$ROOT/tutorials/batch/combustion/nox03_millerbowman_large" "$W/case"; rm -rf "$W/case/expected"
for i in 1 2 3 4 5; do
  CHOUPO_HOME="$ROOT" "$BIN" "$W/case" "${1:-20000}" "$HERE/state_mid.txt" 2>&1 | grep -a BENCH
done | awk '{r=$3; j=$6; if(!mr||r<mr)mr=r; if(!mj||j<mj)mj=j} END{print "best rhs", mr, "us   best jacobian", mj, "us"}'
