#!/usr/bin/env bash
# Fouling SNAPSHOT scan (not a time evolution): copies of the steady ed09 wine
# case with the membranes' area resistance R_area multiplied by a factor, at
# the clean case's own solved current held fixed.  Prints U and U per pair.
# usage: fouling_scan.sh <ed09Case> <workDir> <I_A> factor...
set -euo pipefail
src=$1; wd=$2; I=$3; shift 3
for f in "$@"; do
  d=$wd/foul_$f; rm -rf "$d"; cp -r "$src" "$d"; rm -f "$d/constant/propertyManifest" "$d/expected"
  python3 - "$d/constant/assets/CMX_AMX.dat" "$f" <<'PY'
import re,sys
p,f=sys.argv[1],float(sys.argv[2]); s=open(p).read()
s=re.sub(r'(\n\s*R_area\s+)([0-9.eE+-]+);', lambda m: f"{m.group(1)}{float(m.group(2))*f!r};", s)
open(p,'w').write(s)
PY
  sed -i "s/targetConductivityRemoval *0.20;/current $I;/" "$d/system/flowsheetDict"
  ( cd "$d" && choupoSolve > log.run 2>&1 ) || { echo "factor $f: exit $?"; continue; }
  python3 - "$d/log.run" "$f" <<'PY'
import json,sys
t=open(sys.argv[1]).read(); j=json.loads(t.split('<<<Choupo:result-begin>>>')[1].split('<<<Choupo:result-end>>>')[0])
k=j['kpis']['edStack']
print(f"factor {sys.argv[2]}\tI {k['I']:.3f} A\tU {k['U']:.2f} V\tU/pair {(k['U'])/k['N_cellpairs']:.3f} V\tdemin_K {k['demin_K']:.4f}\tR_pair {k['R_pair']:.4g} ohm\ti/ilim {k['i_over_ilim']:.4f}")
PY
done
