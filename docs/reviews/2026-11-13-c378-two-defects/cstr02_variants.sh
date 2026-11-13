#!/usr/bin/env bash
# cstr02_reversible_wgs: the ORIGINAL case files (origin/main) on this build, and
# the branch's case with its feed pin changed to `phase liquid;` or removed.
#   bash cstr02_variants.sh <repo-root> <scratch-dir>
# Each variant is run twice; prints the residence time line and X_limiting.
set -u
R=$(cd "$1" && pwd); S=$2; mkdir -p "$S"
C=tutorials/steady/reactors/cstr02_reversible_wgs
run() { (cd "$1" && for i in 1 2; do CHOUPO_HOME=$R LC_ALL=C "$R/choupoSolve" . > run$i.log 2>&1; echo "  exit $?"; done
        cmp -s run1.log run2.log && echo "  two runs identical"
        grep -E "Feed basis|Residence" run1.log
        python3 -c "import re,json;s=open('run1.log').read();k=json.loads(re.findall(r'<<<Choupo:result-begin>>>\n(.*?)\n<<<Choupo:result-end>>>',s,re.S)[-1])['kpis']['wgs'];print('  X_limiting',k['X_limiting'],'tau_s',k['tau_s'],'V_R',k['V_R'])"); }
rm -rf "$S/orig" && mkdir -p "$S/orig" && (cd "$R" && git archive origin/main $C | tar -x -C "$S/orig")
echo "original (origin/main) case files:"; run "$S/orig/$C"
for v in liquid none; do
  rm -rf "$S/$v" && cp -r "$R/$C" "$S/$v"
  if [ $v = liquid ]; then sed -i 's/^phase           gas;/phase           liquid;/' "$S/$v/0/feed"
  else sed -i '/^phase           gas;/d' "$S/$v/0/feed"; fi
  echo "branch case, feed pin -> $v:"; run "$S/$v"
done
