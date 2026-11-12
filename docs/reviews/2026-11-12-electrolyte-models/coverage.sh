#!/usr/bin/env bash
# Coverage counts for item 6: which tutorial cases select each electrolyte
# activity variant, and how many catalogue records feed it.  Read-only grep.
#   coverage.sh <repo_root>     -> TSV on stdout
set -euo pipefail
cd "${1:?usage: coverage.sh <repo_root>}"

caseOf() { sed -E 's#/(system|constant)/.*##' | sort -u; }
emit() {   # variant  selector  list-of-case-dirs
    local v="$1" sel="$2" list="$3"
    local n; n=$(printf '%s\n' "$list" | grep -c . || true)
    printf '%s\t%s\t%s\t%s\n' "$v" "$sel" "$n" "$(printf '%s\n' "$list" | sed 's#^tutorials/##' | paste -sd, -)"
}

printf 'variant\tselector\tn_tutorial_cases\tcases\n'

# thermoPhysPropDict declarations (process units and props ops that read the package)
emit "pitzer single-salt (package)" "equilibrium.aqueous.activityModel { model Pitzer; } (formulation electrolyteGammaPhi)" \
  "$(grep -rlE '(^|[{;])\s*model\s+[Pp]itzer\s*;' tutorials --include=thermoPhysPropDict | caseOf)"
emit "eNRTL single-salt (package)" "equilibrium.aqueous.activityModel { model eNRTL; }" \
  "$(grep -rlE '(^|[{;])\s*model\s+eNRTL\s*;' tutorials --include=thermoPhysPropDict | caseOf)"
emit "pitzerHMW (aqueousProperties surface)" "aqueousProperties.activityCoefficients { model PitzerHMW; }" \
  "$(grep -rlE '(^|[{;])\s*model\s+PitzerHMW\s*;' tutorials --include=thermoPhysPropDict | caseOf)"
emit "davies (aqueousProperties surface)" "aqueousProperties.activityCoefficients { model Davies; }" \
  "$(grep -rlE '(^|[{;])\s*model\s+Davies\s*;' tutorials --include=thermoPhysPropDict | caseOf)"
emit "edwardsPitzer (aqueousProperties surface)" "aqueousProperties.activityCoefficients { model EdwardsPitzer; }" \
  "$(grep -rlE '(^|[{;])\s*model\s+EdwardsPitzer\s*;' tutorials --include=thermoPhysPropDict | caseOf)"
emit "composite ionic davies + molecular <w>" "equilibrium.aqueous.activityModel { ionic davies; molecular NRTL|UNIQUAC|UNIFAC; }" \
  "$(grep -rlE 'ionic\s+davies\s*;\s*molecular' tutorials --include=thermoPhysPropDict | caseOf)"
emit "reactive ionic davies (no molecular)" "equilibrium.aqueous.activityModel { ionic davies; }" \
  "$(grep -rlE 'ionic\s+davies\s*;\s*\}' tutorials --include=thermoPhysPropDict | caseOf)"
emit "reactive ionic pitzerHMW" "equilibrium.aqueous.activityModel { ionic pitzerHMW; ... }" \
  "$(grep -rlE 'ionic\s+pitzerHMW' tutorials --include=thermoPhysPropDict | caseOf)"

# op-level selectors (propsDict)
emit "speciate op activityModel pitzerHMW" "speciate { activityModel pitzerHMW; }" \
  "$(grep -rlE 'activityModel\s+pitzerHMW\s*;' tutorials --include=propsDict | caseOf)"
emit "speciate op activityModel davies" "speciate { activityModel davies; }" \
  "$(grep -rlE 'activityModel\s+davies\s*;' tutorials --include=propsDict | caseOf)"
emit "speciate op activityModel edwardsPitzer" "speciate { activityModel edwardsPitzer; }" \
  "$(grep -rlE 'activityModel\s+edwardsPitzer\s*;' tutorials --include=propsDict | caseOf)"
emit "pitzerActivity op (single-salt kernel)" "type pitzerActivity;" \
  "$(grep -rlE 'type\s+pitzerActivity\s*;' tutorials --include=propsDict | caseOf)"
emit "electrolyteActivity op (package route)" "type electrolyteActivity;" \
  "$(grep -rlE 'type\s+electrolyteActivity\s*;' tutorials --include=propsDict | caseOf)"
emit "enrtlMultiSalt op" "type enrtlMultiSalt;" \
  "$(grep -rlE 'type\s+enrtlMultiSalt\s*;' tutorials --include=propsDict | caseOf)"
emit "enrtlMixedSolvent op" "type enrtlMixedSolvent;" \
  "$(grep -rlE 'type\s+enrtlMixedSolvent\s*;' tutorials --include=propsDict | caseOf)"
emit "electrolyteFit op" "type electrolyteFit;" \
  "$(grep -rlE 'type\s+electrolyteFit\s*;' tutorials --include=propsDict | caseOf)"

# catalogue records
printf 'records\tdata/standards/parameters/Pitzer/pairs\t%s\t\n' "$(ls data/standards/parameters/Pitzer/pairs | wc -l)"
for d in theta psi lambda zeta; do
  printf 'records\tdata/standards/parameters/Pitzer/%s\t%s\t\n' "$d" "$(ls data/standards/parameters/Pitzer/$d | wc -l)"
done
printf 'records\tdata/standards/parameters/eNRTL\t%s\t\n' "$(ls data/standards/parameters/eNRTL | wc -l)"
printf 'records\tdata/standards/parameters/EdwardsPitzer\t%s\t\n' "$(ls data/standards/parameters/EdwardsPitzer | wc -l)"
printf 'records\tPitzer pairs with SP77 T-functions (sp_q1)\t%s\t\n' "$(grep -l 'sp_q1' data/standards/parameters/Pitzer/pairs/*.dat | wc -l)"
printf 'records\tPitzer pairs with linear T-slots (dbeta0_dT)\t%s\t\n' "$(grep -l 'dbeta0_dT' data/standards/parameters/Pitzer/pairs/*.dat | wc -l)"
printf 'records\tPitzer pairs declaring top-level tCorrelationForm\t%s\t\n' "$(grep -l '^tCorrelationForm' data/standards/parameters/Pitzer/pairs/*.dat | wc -l)"
printf 'records\tEdwardsPitzer records declaring Trange\t%s\t\n' "$(grep -l 'Trange' data/standards/parameters/EdwardsPitzer/*.dat | wc -l)"
printf 'records\teNRTL pairs declaring a T-dependence key (tau_m_ca_b / dtau)\t%s\t\n' "$(grep -lE 'tau_m_ca_b|dtau|tauB' data/standards/parameters/eNRTL/*.dat | wc -l)"
