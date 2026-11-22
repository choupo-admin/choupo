#!/bin/bash
# Deterministic cost of nox03 (integrator, rtol 1e-8, atol 1e-15) in a given built tree, in instructions.
#   cgrun.sh TREE LABEL INTEGRATOR     -> /tmp/cg_LABEL_INTEGRATOR.out, counts printed
# Needs valgrind.  The rhs-call count comes from a separate CHOUPO_ODE_STATS run (counts do not depend on timers).
TREE=$1; LABEL=$2; INTEG=$3
D=/tmp/cgcase_${LABEL}_${INTEG}
rm -rf "$D"; cp -r "$TREE/tutorials/batch/combustion/nox03_millerbowman_large" "$D"; rm -rf "$D/expected"
sed -i "s/integrator [A-Za-z0-9]*;/integrator $INTEG;/" "$D/system/flowsheetDict"
sed -i 's/rtol[[:space:]]*[0-9.eE+-]*;/rtol 1e-8;/; s/atol[[:space:]]*[0-9.eE+-]*;/atol 1e-15;/' "$D/system/controlDict"
cd "$D"
export CHOUPO_HOME="$TREE"
CHOUPO_ODE_STATS=1 "$TREE/build/linux64Gcc/choupoBatch" . 2>&1 | grep -o "\[ode-stats\].*" | sed 's/time\[ms\].*//'
valgrind --tool=callgrind --callgrind-out-file=/tmp/cg_${LABEL}_${INTEG}.out "$TREE/build/linux64Gcc/choupoBatch" . > /dev/null 2> /tmp/cg_${LABEL}_${INTEG}.err
grep "refs" /tmp/cg_${LABEL}_${INTEG}.err
