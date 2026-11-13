#!/bin/bash
# usage: sweep_cases.sh <choupo_root> <work_dir> case_dir...
# Runs each case on a COPY with its own binary; prints exit code, the number of
# `[estimate] species` console lines and of JSON advisories with a species locus.
R=$1; W=$2; shift 2
printf "case\texit\testimate_species_lines\tjson_species_advisories\n"
for c in "$@"; do
  n=$(basename $c); d=$W/sweep/$n; rm -rf $d; mkdir -p $W/sweep; cp -r $R/$c $d
  app=$(grep -oE '^\s*application\s+\w+' $d/system/controlDict | awk '{print $2}')
  (cd $d && CHOUPO_HOME=$R timeout 600 $R/$app . > out.txt 2>&1); rc=$?
  printf "%s\t%s\t%s\t%s\n" "$c" "$rc" "$(grep -c '^\[estimate\] species' $d/out.txt)" "$(grep -c '"locus": "species ' $d/out.txt)"
done
