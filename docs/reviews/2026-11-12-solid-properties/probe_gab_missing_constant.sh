#!/usr/bin/env bash
# Probe: convDryer01 with the GAB energy constant C deleted from the case's own
# sucrose `sorption {}` block.  Component.cpp reads Xm/C/K with a 0.0 default;
# does the dryer refuse, announce, or run on X_eq = 0?
# Run from the repository root after `make all`:
#     bash docs/reviews/2026-11-12-solid-properties/probe_gab_missing_constant.sh <scratchDir>
set -u
OUT=${1:?scratch dir}; mkdir -p "$OUT"
source etc/bashrc >/dev/null 2>&1
for v in base noC; do
  C=$OUT/gab_$v; rm -rf "$C"; cp -r tutorials/steady/drying/convDryer01_sugar_curve "$C"; rm -f "$C"/log.*
  [ -f "$C/constant/propertyManifest" ] && sed -i 's/type          imported;/type          adopted;/' "$C/constant/propertyManifest"
  [ $v = noC ] && python3 -I - "$C/constant/components/sucrose.dat" <<'P'
import re,sys
p=sys.argv[1]; t=open(p).read()
m=re.search(r"(?m)^sorption\s*\{", t); i=m.end(); j=t.index("}", i)
blk=re.sub(r"(?m)^\s*C\s+[0-9.eE+-]+;.*\n", "", t[i:j])
open(p,"w").write(t[:i]+blk+t[j:])
P
  (cd "$C" && choupoSolve > run.log 2>&1; echo "== $v exit $?")
  grep -A6 "^sorption" "$C/constant/components/sucrose.dat" | head -6
  grep -niE "X_eq|Xeq|equilibrium moisture|ERROR|GAB" "$C/run.log" | head -6
done
