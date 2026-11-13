#!/bin/bash
# The case probes of the re-review, each on a COPY: a pipe with a declared
# surface tension (Friedel), a tray-efficiency column with no surface-tension
# model and a declared sigma, a laboratory analysis whose density is derived,
# and a pure-fluid package switched from IF97 to the Helmholtz route.  Prints
# each copy's liquid-property table (or its refusal).  Nothing is written in
# the checkout.
#   usage: bash probe_cases.sh <built checkout> <scratch dir>
set -u
TREE="$1"; OUT="$2"; mkdir -p "$OUT"
run() { ( cd "$OUT/$1" && CHOUPO_HOME="$TREE" "$TREE/choupoSolve" . > "$OUT/$1.log" 2>&1 ); echo "=== $1 (exit $?)";
        grep -m3 -E "^ERROR|Model:|formulation" "$OUT/$1.log";
        sed -n '/^\[liquid properties\]/,/<<<Choupo:result-begin>>>/p' "$OUT/$1.log" | grep -v '<<<'; }
fresh() { rm -rf "$OUT/$2"; cp -r "$TREE/$1" "$OUT/$2"; }
fresh tutorials/steady/hydraulics/pipe02_airwater_twophase friedel
sed -i 's/model  LockhartMartinelli;.*/model Friedel; surfaceTension 0.072;/' "$OUT/friedel/system/flowsheetDict"; run friedel
fresh tutorials/steady/distillation/trayEfficiency01_yanagi14 trayEff
sed -i 's/surfaceTension { model BrockBird; }//' "$OUT/trayEff/constant/thermoPhysPropDict"
sed -i 's/trayType               sieve;/trayType               sieve; sigma 0.0185;/' "$OUT/trayEff/system/flowsheetDict"; run trayEff
fresh tutorials/steady/flash/analysis01_water_analysis_inlet analysis
sed -i 's/density   { value 998.4 kg\/m3;  provenance measured; }/density   { provenance derivedDiluteVolume; }/' "$OUT/analysis/0/feed"; run analysis
for c in reboiler_water_copper heatExchanger02_geometry_U; do
  fresh tutorials/steady/heat/$c helm_$c
  sed -i 's/water { method IF97; }/water { method Helmholtz; equation IAPWS95; }/' "$OUT/helm_$c/constant/thermoPhysPropDict"
  mkdir -p "$OUT/helm_$c/constant/parameters/Helmholtz"
  cp "$TREE/data/standards/parameters/Helmholtz/IAPWS95.dat" "$OUT/helm_$c/constant/parameters/Helmholtz/"
  run helm_$c
done
