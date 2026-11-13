#!/bin/bash
#  Reproduces the table of REPORT.md section 3.
#  usage: probe.sh <repository root with a native build> <scratch directory>
#  Runs batch25_blowdown_thermal once per row with a preload shim that moves
#  every N-th result of one math-library function by one unit in the last
#  place, and prints one tab-separated row per run.  Writes only under the
#  scratch directory.
set -u
ROOT=$(cd "$1" && pwd); S=$2
HERE=$(cd "$(dirname "$0")" && pwd)
CASE=tutorials/batch/adsorber/batch25_blowdown_thermal
mkdir -p "$S" && gcc -O1 -fPIC -shared -fno-builtin -o "$S/ulp.so" "$HERE/ulp_shim.c" -ldl -lm || exit 2
export CHOUPO_HOME=$ROOT
printf 'function\tevery\texit\tmass_closure_CO2\tn_CO2_final_kmol\telement_C_closure_rel\telement_O_closure_rel\n'
get() { grep -o "\"$1\": [^,}]*" "$2" | head -1 | sed 's/.*: //'; }
run() {
    d=$S/run; rm -rf "$d"; mkdir -p "$d"
    (cd "$ROOT" && git archive HEAD "$CASE") | tar -x -C "$d"
    if [ "$1" = none ]; then
        "$ROOT/build/linux64Gcc/choupoBatch" "$d/$CASE" > "$S/run.log" 2>&1
    else
        ULP_FN=$1 ULP_EVERY=$2 LD_PRELOAD=$S/ulp.so \
            "$ROOT/build/linux64Gcc/choupoBatch" "$d/$CASE" > "$S/run.log" 2>&1
    fi
    rc=$?
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$1" "$2" "$rc" \
        "$(get mass_closure_CO2 "$S/run.log")" "$(get n_CO2_final "$S/run.log")" \
        "$(get element_C_closure_rel "$S/run.log")" "$(get element_O_closure_rel "$S/run.log")"
}
run none 0
for ev in 1 2 3 7 101 1009 10007 99991 500009; do run pow $ev; done
for ev in 1 3 101 10007; do run exp $ev; done
