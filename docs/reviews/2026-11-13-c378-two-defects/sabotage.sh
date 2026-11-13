#!/usr/bin/env bash
# Hand sabotages of the C378 two-defects branch, one at a time.
#   bash sabotage.sh <repo-root> <scratch-dir> <id>
# Applies the sabotage <id> (exact-string replacement, see SAB below), rebuilds
# with `nice -n 15 make all -j2`, runs the new gate and `bin/runTests --scope`
# over the three witness cases, writes <scratch>/sab_<id>.{gate,scope}.log,
# then restores every touched file with `git checkout --` and rebuilds.
# Must run on a LOCAL branch (bin/runTests refuses a detached HEAD).
set -u
ROOT=$1; SCR=$2; ID=$3
cd "$ROOT" || exit 2
py() { python3 - "$@"; }
apply() {  # file old new
  py "$1" "$2" "$3" <<'EOF'
import sys
f, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(f).read()
n = s.count(old)
if n < 1:
    sys.exit(f"sabotage: pattern not found in {f}")
open(f, "w").write(s.replace(old, new))
print(f"sabotage: {n} replacement(s) in {f}")
EOF
}
FILES=()
case "$ID" in
  S1_density_ignores_phase)
    F=src/thermo/ThermoPackage.cpp; FILES=($F)
    apply $F "const scalar vm = m.v_molar(T, st.pEval);" "const scalar vm = m.v_molar(T, P_Pa);" ;;
  S2_cstr_never_vapour)
    F=src/unitOperations/reactor/CSTR.cpp; FILES=($F)
    apply $F "if (vf_in >= 1.0 - 1.0e-9) return FeedBasis::vapour;" "if (false) return FeedBasis::vapour;" ;;
  S3a_pump_drops_phase)
    F=src/unitOperations/rotating/Pump.cpp; FILES=($F)
    apply $F "x, DensityPhase::Liquid)" "x)" ;;
  S3b_compressor_drops_phase)
    F=src/unitOperations/rotating/Compressor.cpp; FILES=($F)
    apply $F "y, DensityPhase::Vapour)" "y)" ;;
  S3c_turbine_drops_phase)
    F=src/unitOperations/rotating/Turbine.cpp; FILES=($F)
    apply $F "y, DensityPhase::Vapour)" "y)" ;;
  S3d_overloads_ignore_phase)
    F=src/thermo/ThermoPackage.cpp; FILES=($F)
    apply $F "return m.h_molar(T, st.pEval);" "return m.h_molar(T, P_Pa);"
    apply $F "return m.s_molar(T, st.pEval);" "return m.s_molar(T, P_Pa);" ;;
  S4_stream_pressure_is_P)
    F=src/thermo/pureFluid/PureFluidModel.cpp; FILES=($F)
    apply $F "return onLine ? s.pEval : p_Pa;" "return p_Pa;" ;;
  S5_satvapour_on_liquid_side)
    F=src/thermo/pureFluid/PureFluidModel.cpp; FILES=($F)
    apply $F "s.pEval     = ps * (1.0 - 1.0e-9);              // just below: the vapour side" "s.pEval     = ps;" ;;
  S6_main_equivalent_purefluid)
    # S1 + S3d + S4 together: the pure-fluid routes as origin/main had them
    FILES=(src/thermo/ThermoPackage.cpp src/thermo/pureFluid/PureFluidModel.cpp)
    apply src/thermo/ThermoPackage.cpp "const scalar vm = m.v_molar(T, st.pEval);" "const scalar vm = m.v_molar(T, P_Pa);"
    apply src/thermo/ThermoPackage.cpp "return m.h_molar(T, st.pEval);" "return m.h_molar(T, P_Pa);"
    apply src/thermo/ThermoPackage.cpp "return m.s_molar(T, st.pEval);" "return m.s_molar(T, P_Pa);"
    apply src/thermo/pureFluid/PureFluidModel.cpp "return onLine ? s.pEval : p_Pa;" "return p_Pa;" ;;
  *) echo "unknown sabotage $ID"; exit 2 ;;
esac
nice -n 15 make all -j2 > "$SCR/sab_$ID.build.log" 2>&1 || { echo "build failed"; }
python3 bin/curate/check_pure_fluid_phase_asked.py > "$SCR/sab_$ID.gate.log" 2>&1; echo "gate exit $?" >> "$SCR/sab_$ID.gate.log"
nice -n 15 bin/runTests --scope tutorials/steady/heat/condenser01_film_nusselt \
    tutorials/steady/reactors/cstr02_reversible_wgs tutorials/steady/power/rankine02_water \
    > "$SCR/sab_$ID.scope.log" 2>&1
if [ "${KEEP:-}" != "1" ]; then
  git checkout -- "${FILES[@]}"
  nice -n 15 make all -j2 > "$SCR/sab_$ID.restore.log" 2>&1
fi
echo "done $ID"
