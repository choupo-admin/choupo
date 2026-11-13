#!/bin/bash
# probe_deadlock.sh <repo root> <scratch dir>
# Builds the measured_over_massless case with probes.py, runs choupoSolve on it
# in the background, and after 12 s prints the process state and its stack
# (gdb).  A deadlock shows state S, futex wait, and noteMassWithoutVolume
# under resolveDensity in the stack.
set -u
R=$(cd "$1" && pwd); S=$(mkdir -p "$2" && cd "$2" && pwd)
H=$(cd "$(dirname "$0")" && pwd)
timeout 400 python3 "$H/probes.py" "$R" "$S" measured_over_massless > "$S/probes_mom.txt" 2>&1
D="$S/measured_over_massless/case"
(CHOUPO_HOME="$R" timeout 60 "$R/choupoSolve" "$D" > "$S/mom_run.log" 2>&1) &
timeout 15 bash -c 'until false; do sleep 12; break; done'
pid=$(pgrep -x choupoSolve -a | grep "$D" | awk '{print $1}' | head -1)
echo "pid $pid"
ps -o pid,stat,pcpu,time,wchan:24 -p "$pid"
timeout 60 gdb -p "$pid" -batch -ex "bt 20" 2>&1 | grep -E "^#" | cut -c1-160
kill "$pid" 2>/dev/null
cat "$S/probes_mom.txt"
