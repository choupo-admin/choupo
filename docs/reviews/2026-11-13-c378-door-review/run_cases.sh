#!/bin/bash
# Run the review's cases on copies in a scratch directory and print each
# unit's liquid-property lines (the table the run prints before its result).
#   usage: TREE=<choupo checkout, built with make all> OUT=<scratch dir> \
#          bash run_cases.sh
# Nothing is written inside TREE.
set -u
: "${TREE:?set TREE to the built checkout}"; : "${OUT:?set OUT to a scratch dir}"
mkdir -p "$OUT"
CASES="tutorials/plant/aceticAcid02_plant
tutorials/steady/membranes/membrane27_swro_energy_recovery
tutorials/steady/crystallisation/crystalliser08_nacl_antisolvent_msmpr
tutorials/steady/rotating/pump01_water
tutorials/steady/hydraulics/pumpSystem01_operating_point
tutorials/steady/reactors/cstr01_first_order
tutorials/steady/reactors/cstr07_lhhw_methylAcetate
tutorials/steady/drying/sprayDryer07_design
tutorials/steady/distillation/column09_tray_hydraulics
tutorials/steady/heat/condenser01_film_nusselt
tutorials/steady/heat/reboiler_water_copper
tutorials/steady/heat/heatExchanger02_geometry_U
tutorials/steady/electrodialysis/ed01_nacl_desalination
tutorials/steady/electrodialysis/ed04_limiting_current_multiionic
tutorials/batch/electrodialysis/edbatch01_constant_current
tutorials/unsteady/unsteady03_nf_feed_and_bleed_startup
tutorials/unsteady/unsteady05_tank_valve_drain"
for c in $CASES; do
  n=$(basename "$c"); rm -rf "$OUT/$n"; cp -r "$TREE/$c" "$OUT/$n"
  app=$(grep -E '^\s*application' "$OUT/$n/system/controlDict" | awk '{print $2}' | tr -d ';')
  ( cd "$OUT/$n" && CHOUPO_HOME="$TREE" timeout 900 "$TREE/build/linux64Gcc/$app" . > "$OUT/$n.log" 2>&1 )
  echo "=== $n (exit $?)  propertySources blocks: $(grep -c '"propertySources"' "$OUT/$n.log")"
  sed -n '/^\[liquid properties\]/,/<<<Choupo:result-begin>>>/p' "$OUT/$n.log" | grep -v '<<<'
done
