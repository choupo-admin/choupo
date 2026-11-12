#!/usr/bin/env bash
# Run the eight C361 slice-3/4 cases on scratch copies and every independent check.
# Usage: bash run_all.sh <repo-root> [work-dir]
#   <repo-root>  a built Choupo tree (make all done)
#   [work-dir]   where the case copies and logs go (default: a new mktemp -d)
set -euo pipefail
ROOT=$(cd "$1" && pwd)
WORK=${2:-$(mktemp -d)}
HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$WORK"
source "$ROOT/etc/bashrc" >/dev/null 2>&1 || true
CASES="screen01_dolomite_karra hydrocyclone01_quartz_willsTable91 circuit01_herbstFuerstenau_closedCircuit
filter01_caco3_rotaryDrum filter02_caco3_pressWashing thickener01_settlingTest_talmageFitch
centrifuge01_tubularBowl_geankoplis centrifuge02_discStack_sigmaIdentity"
for c in $CASES; do
  rm -rf "$WORK/$c"; cp -r "$ROOT/tutorials/steady/solids/$c" "$WORK/$c"
  ( cd "$WORK" && "$ROOT/bin/runCase" "$WORK/$c" > "$WORK/$c.log" 2>&1 ) || echo "RUN FAILED: $c"
  python3 "$HERE/extract_json.py" "$(ls "$WORK/$c"/log.choupo* | head -1)" "$WORK/$c.json"
done
echo "=== screen01";      python3 "$HERE/screen_karra.py"       "$WORK/screen01_dolomite_karra.json"
echo "=== hydrocyclone01"; python3 "$HERE/hydrocyclone_wills.py" "$WORK/hydrocyclone01_quartz_willsTable91.json"
echo "=== circuit01";     python3 "$HERE/circuit_hf.py"         "$WORK/circuit01_herbstFuerstenau_closedCircuit.json"
echo "=== filter01/02";   python3 "$HERE/filters_ruth.py"       "$WORK/filter01_caco3_rotaryDrum.json" "$WORK/filter02_caco3_pressWashing.json"
echo "=== thickener01";   python3 "$HERE/thickener_tf.py"       "$WORK/thickener01_settlingTest_talmageFitch.json"
echo "=== centrifuge01/02"; python3 "$HERE/centrifuge_sigma.py" "$WORK/centrifuge01_tubularBowl_geankoplis.json" "$WORK/centrifuge02_discStack_sigmaIdentity.json"
echo "=== conservation";  python3 "$HERE/conservation.py" "$WORK"
echo "work dir: $WORK"
