#!/usr/bin/env bash
# Film and saturation properties for nusselt_condenser01.py, from the tree's own
# IF97 kernel and transport releases (choupoProps propertyPoint + steamTables).
#   bash condenser01_film_props.sh <repo-root> <scratch-dir>
set -u
R=$(cd "$1" && pwd); S=$2/props; rm -rf "$S"; mkdir -p "$S/system"
cp -r "$R/tutorials/steady/heat/condenser01_film_nusselt/constant" "$S/"
printf 'application   choupoProps;\ndescription   "review: film properties of condenser01";\nverbosity     2;\n' > "$S/system/controlDict"
cat > "$S/system/propsDict" <<'PD'
operations
(
    { name film; type propertyPoint; state { T 360.058287567 K; P 1 bar; composition { water 1.0; } }
      properties ( viscosity_liquid thermal_conductivity_liquid ); }
    { name r1film; type steamTables; source "IAPWS R7-97(2012)"; point { P 100000 Pa; T 360.058287567 K; } }
    { name vapsat; type steamTables; source "IAPWS R7-97(2012)"; point { P 99999.9999 Pa; T 372.755918611 K; } }
    { name liqsat; type steamTables; source "IAPWS R7-97(2012)"; point { P 100000.0001 Pa; T 372.755918611 K; } }
);
PD
(cd "$S" && CHOUPO_HOME=$R LC_ALL=C "$R/choupoProps" . > run.log 2>&1; echo "exit $?"
 grep -E "steamTables: T|v  =|h  =" run.log
 grep -oE '"thermal_conductivity_liquid": [0-9.e+-]+|"viscosity_liquid": [0-9.e+-]+' run.log | sort -u)
