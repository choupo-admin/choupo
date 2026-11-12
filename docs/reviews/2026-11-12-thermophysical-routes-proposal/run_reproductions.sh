#!/usr/bin/env bash
# C378 review -- reproduce the defects the thermophysical-property-routes record
# states as its motivation, plus the ones this review adds.
#
# Run (from the repository root, after `make all`):
#   bash docs/reviews/2026-11-12-thermophysical-routes-proposal/run_reproductions.sh [workdir]
# workdir defaults to $TMPDIR/c378-review; it is created and filled with
# throw-away props cases (nothing in the tracked tree is written).
# Prints engine values as TSV on stdout (property, state, value, route).
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
BIN="$ROOT/build/linux64Gcc/choupoProps"
W=${1:-${TMPDIR:-/tmp}/c378-review}
rm -rf "$W"; mkdir -p "$W"
export CHOUPO_HOME="$ROOT"

mkcase () {   # mkcase <name> <components...>  (ideal gamma-phi package)
  local c="$W/$1"; shift
  mkdir -p "$c/system" "$c/constant"; touch "$c/$(basename "$c").cho"
  printf 'application choupoProps;\ndescription "C378 review probe";\nverbosity 2;\n' > "$c/system/controlDict"
  { echo "recordType thermophysicalPropertySystem;"; echo "schemaVersion 2;"
    echo "components ( $* );"
    echo "equilibrium { formulation gammaPhi; liquid { activityModel ideal; standardState pureLiquid; } vapour { fugacityModel idealGas; } }"
  } > "$c/constant/thermoPhysPropDict"
}
runcase () { (cd "$W/$1" && "$BIN" > run.log 2>&1) || { echo "# $1 exited non-zero: $(grep -m1 'fatal' "$W/$1/run.log")" >&2; return 0; }; }

# --- 1. liquid density through the engine's one route (ThermoPackage::density)
mkcase rho water CO2 ethane HCl ethanol
cat > "$W/rho/system/propsDict" <<'P'
operations (
 { name w; type propertyScan1D; vary { variable T; from 273.16 K; to 373.16 K; n 26; } state { P 1.5 bar; composition { water 1.0; } } properties ( rho_liquid_water ); output { file w.csv; } }
 { name w573; type propertyScan1D; vary { variable T; from 298.15 K; to 573.15 K; n 2; } state { P 100 bar; composition { water 1.0; } } properties ( rho_liquid_water ); output { file w573.csv; } }
 { name wP; type propertyScan1D; vary { variable P; from 1 bar; to 500 bar; n 2; } state { T 298.15 K; composition { water 1.0; } } properties ( rho_liquid_water ); output { file wP.csv; } }
 { name co2; type propertyScan1D; vary { variable T; from 280 K; to 298.15 K; n 2; } state { P 70 bar; composition { CO2 1.0; } } properties ( rho_liquid_CO2 ); output { file co2.csv; } }
 { name eth; type propertyScan1D; vary { variable T; from 250 K; to 298 K; n 2; } state { P 50 bar; composition { ethane 1.0; } } properties ( rho_liquid_ethane ); output { file eth.csv; } }
 { name hcl; type propertyScan1D; vary { variable T; from 250 K; to 298 K; n 2; } state { P 50 bar; composition { HCl 1.0; } } properties ( rho_liquid_HCl ); output { file hcl.csv; } }
);
P
runcase rho
echo -e "quantity\tstate\tvalue\tunit\troute"
for f in w w573 wP co2 eth hcl; do tail -n +2 "$W/rho/$f.csv" | while IFS=, read a b; do echo -e "rho_liquid ($f)\t$a\t$b\tkg/m3\tThermoPackage::density liquid branch"; done; done

# --- 2. cryogenic liquids whose Vliq is stated at Tb: refused?
for c in N2:90 CH4:120; do n=${c%%:*}; T=${c##*:}
  mkcase cryo_$n $n
  echo "operations ( { name r; type propertyPoint; state { T $T K; P 5 bar; composition { $n 1.0; } } properties ( rho_liquid_$n ); } );" > "$W/cryo_$n/system/propsDict"
  runcase cryo_$n
  echo -e "rho_liquid $n\tT=$T K\t$(grep -c 'cannot anchor' "$W/cryo_$n/run.log") refusal line(s)\t-\t$(grep -o "Rackett cannot anchor[^(]*" "$W/cryo_$n/run.log" | head -1)"
done

# --- 3. reference equations the engine carries (referenceEoS op)
mkcase ref water CO2 N2 CH4
{ echo "operations ("
  for T in 273.16 277.16 373.16 573.16; do echo "{ name w_$T; type referenceEoS; equation IAPWS95; saturation { T $T K; } }"; done
  echo "{ name w_500bar; type referenceEoS; equation IAPWS95; state { T 298.15 K; p 500 bar; } }"
  for T in 280 298.15; do echo "{ name co2_$T; type referenceEoS; equation SpanWagner1996; saturation { T $T K; } }"; done
  echo "{ name n2_90; type referenceEoS; equation Span2000; saturation { T 90 K; } }"
  echo "{ name ch4_120; type referenceEoS; equation SetzmannWagner1991; saturation { T 120 K; } }"
  echo ");"; } > "$W/ref/system/propsDict"
runcase ref
grep -o '"name": "[^"]*", "type": "referenceEoS", "diagnostics": {[^}]*' "$W/ref/run.log" | \
  sed -E 's/"name": "([^"]*)".*"rho": ([0-9.e+-]+).*/\1\t\2/; s/"name": "([^"]*)".*"rhoL": ([0-9.e+-]+).*/\1\t\2/' | \
  while IFS=$'\t' read n v; do echo -e "reference rho_liquid\t$n\t$v\tkg/m3\treferenceEoS op"; done

# --- 4. viscosity, surface tension
mkcase tr water ethanol triethanolamine ethyleneGlycol monoethanolamine nHexane
{ echo "operations ("
  for x in 0.25 0.30; do w=$(python3 -c "print(round(1-$x,4))")
    for r in GrunbergNissan logMoleAverage; do
      echo "{ name mu_${r}_x$x; type propertyPoint; state { T 298.15 K; P 1 bar; composition { water $w; ethanol $x; } } thermo { transport { liquid { viscosity { model Vogel; mixingRule $r; } } } } properties ( viscosity_liquid ); }"
    done; done
  for c in water triethanolamine ethyleneGlycol monoethanolamine nHexane; do for m in BrockBird StoredCorrelation; do
    echo "{ name sig_${c}_$m; type propertyPoint; state { T 298.15 K; P 1 bar; composition { $c 1.0; } } thermo { transport { interface { surfaceTension { model $m; } } } } properties ( surface_tension ); }"
  done; done
  echo ");"; } > "$W/tr/system/propsDict"
runcase tr
grep -oE '"name": "(mu|sig)_[^"]*"[^}]*"(viscosity_liquid|surface_tension)": [0-9.e+-]+' "$W/tr/run.log" | \
  sed -E 's/"name": "([^"]*)".*"(viscosity_liquid|surface_tension)": ([0-9.e+-]+)/\1\t\3\t\2/' | \
  while IFS=$'\t' read n v k; do u=$([ "$k" = viscosity_liquid ] && echo Pa.s || echo N/m); echo -e "$k\t$n 298.15 K\t$v\t$u\tpropertyPoint"; done
echo -e "G=0 announcement\twater-ethanol\t$(grep -c 'mixes with G = 0' "$W/tr/run.log") line(s)\t-\tGrunberg-Nissan"

# --- 5. liquid diffusivity CO2 in water (Wilke-Chang, the record's Vliq of CO2)
mkcase dif CO2 water
sed -i 's/$//' "$W/dif/constant/thermoPhysPropDict"
echo 'transport { liquid { viscosity { model Vogel; } diffusivity { model WilkeChang; } } }' >> "$W/dif/constant/thermoPhysPropDict"
echo "operations ( { name dco2; type propertyPoint; state { T 298.15 K; P 1 bar; composition { CO2 0.0001; water 0.9999; } } properties ( diffusivity_liquid ); } );" > "$W/dif/system/propsDict"
runcase dif
echo -e "diffusivity_liquid\tCO2 in water 298.15 K\t$(grep -o '"diffusivity_liquid": [0-9.e+-]*' "$W/dif/run.log" | head -1 | awk '{print $2}')\tm2/s\tWilke-Chang, Va = CO2 record Vliq"
