#!/bin/bash
# mk_if97_copy.sh <repo-root> <scratch-dir> <case-rel> : copy a case under <scratch>/cases/<name>_IF97 with pureFluids water IF97 appended.
set -e
repo=$1; scr=$2; c=$3; n=$(basename $c)
mkdir -p $scr/cases; rm -rf $scr/cases/${n}_IF97; cp -r $repo/$c $scr/cases/${n}_IF97
printf '\npureFluids\n{\n    water { method IF97; }\n}\n' >> $scr/cases/${n}_IF97/constant/thermoPhysPropDict
echo $scr/cases/${n}_IF97
