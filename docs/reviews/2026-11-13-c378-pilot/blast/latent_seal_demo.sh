#!/bin/bash
# Sealed vs unsealed cstr01 with water added to the feed: the sealed case carries no
# parameters/Helmholtz/IAPWS95.dat, so the kernel silently prices water by Rackett.
# usage: latent_seal_demo.sh <repoRoot> <scratchDir>   (writes only under scratchDir)
set -u; R=$(cd "$1" && pwd); S=$2; mkdir -p "$S"
for m in sealed unsealed; do d=$S/c_$m; rm -rf "$d"; cp -r "$R/tutorials/steady/reactors/cstr01_first_order" "$d"; rm -rf "$d/converged" "$d/reports"
  sed -i 's/    aceticAcid    0.5 kmol\/h;/    aceticAcid    0.5 kmol\/h;\n    water         0.2 kmol\/h;/' "$d/0/feed"
  [ $m = unsealed ] && rm "$d/constant/propertyManifest"
  CHOUPO_HOME=$R "$R/choupoSolve" "$d" > "$d.log" 2>&1; echo "$m exit $?"; done
python3 "$(dirname "$0")/cmp_logs.py" "$S/c_sealed.log" "$S/c_unsealed.log" 1e-9 1e-12 | grep -E "sourceId|valueMin|tau_s|X_limiting|differences"
