#!/bin/bash
# Instructions per right-hand-side call and per Jacobian (callgrind): the load-independent axis.
# usage: ir.sh            (needs valgrind, `make all` and the g++ line at the top of test/rhs_bench.cpp)
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../.." && pwd)"
BIN="${BENCH_BIN:-$ROOT/build/linux64Gcc/rhs_bench}"; N=4000
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
cp -r "$ROOT/tutorials/batch/combustion/nox03_millerbowman_large" "$W/case"; rm -rf "$W/case/expected"
for w in rhs jac; do
  CHOUPO_HOME="$ROOT" valgrind --tool=callgrind --callgrind-out-file="$W/cg.$w.out" "$BIN" "$W/case" $N "$HERE/state_mid.txt" $w >/dev/null 2>&1
  callgrind_annotate --inclusive=yes "$W/cg.$w.out" 2>/dev/null | grep -E "BatchReactor::(derivatives_|odeJacobianSparse)" | head -1 \
    | awk -v w=$w -v n=$N '{gsub(",","",$1); c=(w=="jac")?n/10:n+1; printf "%s: %.0f Ir/call\n", w, $1/c}'
done
