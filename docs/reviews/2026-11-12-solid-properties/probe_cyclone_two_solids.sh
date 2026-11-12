#!/usr/bin/env bash
# Probe: cyclone02 (Leith-Licht) fed half its solid MASS as silica (rho_p 2650) and
# half as graphite (a catalogue record that carries NO particle density), and
# (variant mixedCaO) half as CaO (rho_p 3340) to read the mixing rule.  What
# particle density does the cyclone use?  Unsealed copy; catalogue records read.
# Run from the repository root after `make all`:
#     bash docs/reviews/2026-11-12-solid-properties/probe_cyclone_two_solids.sh <scratchDir>
set -u
OUT=${1:?scratch dir}; mkdir -p "$OUT"
source etc/bashrc >/dev/null 2>&1
for v in base mixed mixedCaO; do
  C=$OUT/cyc_$v; rm -rf "$C"; cp -r tutorials/steady/gas-solid/cyclone02_leith_licht "$C"; rm -f "$C"/log.*
  if [ $v != base ]; then
    S2=graphite; N2=2.08142536; [ $v = mixedCaO ] && { S2=CaO; N2=0.44581068; }
    rm -rf "$C/constant/propertyManifest" "$C/constant/components"
    sed -i "s/^components ( N2 silica );/components ( N2 silica $S2 );/" "$C/constant/thermoPhysPropDict"
    # 0.8322237017 kmol/h silica = 50.00 kg/h -> 25 kg/h silica + 25 kg/h graphite
    python3 -I - "$C/0/feed" "$S2" "$N2" <<'P'
import sys,re
p=sys.argv[1]; t=open(p).read()
t=t.replace("silica    0.8322237017 kmol/h;","silica    0.41611185 kmol/h;\n    %s  %s kmol/h;"%(sys.argv[2],sys.argv[3]))
open(p,"w").write(t)
P
  fi
  (cd "$C" && choupoSolve > run.log 2>&1; echo "== $v exit $?")
  grep -nE "rho_p =|Particle rho_p|ERROR|density" "$C/run.log" | head -6
  grep -oE '"cyclone": \{[^}]*\}' "$C/run.log" | grep -oE '"(rho_particle|eta_overall|efficiency_overall|overallEfficiency|d50_um|d50)[^,]*' | head
done
