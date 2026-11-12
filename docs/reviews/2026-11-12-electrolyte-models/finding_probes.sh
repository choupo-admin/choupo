#!/usr/bin/env bash
# Reproduce the specific observations behind findings.tsv, on copies of the
# shipped tutorials (never run in the tree).  Prints a TSV on stdout.
#   finding_probes.sh <repo_root> <work_dir>
set -euo pipefail
REPO="$(cd "${1:?usage: finding_probes.sh <repo_root> <work_dir>}" && pwd)"
WORK="${2:?work_dir}"
export CHOUPO_HOME="$REPO"
mkdir -p "$WORK"
P="$WORK/probes"; rm -rf "$P"; mkdir -p "$P"

printf 'probe\tquantity\tvalue\n'

# --- P1: the same evaporator, Pitzer vs eNRTL (BPE at ~389 K) ---------------
for t in evaporator06_nacl_pitzer evaporator07_nacl_enrtl; do
    cp -r "$REPO/tutorials/steady/evaporation/$t" "$P/$t"
    ( cd "$P/$t" && "$REPO/choupoSolve" . > log 2>&1 )
    printf 'P1\t%s BPE line\t%s\n' "$t" "$(grep -m1 'BPE = electrolyte' "$P/$t/log" | sed 's/^ *//')"
    printf 'P1\t%s caveat lines naming eNRTL or tau\t%s\n' "$t" \
        "$(sed -n '/^ASSUMPTIONS AND CAVEATS/,/^-----/p' "$P/$t/log" | grep -ciE 'enrtl|tau' || true)"
done

# --- P2: a Pitzer pair that DECLARES tCorrelationForm is announced as undeclared
mk() {  # mk <dir> <propsDict body> [thermoPhysPropDict]
    mkdir -p "$1/system" "$1/constant"
    printf 'application choupoProps;\ndescription "probe";\nverbosity 1;\n' > "$1/system/controlDict"
    printf 'operations\n(\n%s\n);\n' "$2" > "$1/system/propsDict"
    if [ $# -ge 3 ]; then printf '%s\n' "$3" > "$1/constant/thermoPhysPropDict"; else
    printf 'recordType thermophysicalPropertySystem;\nschemaVersion 2;\ncomponents ( water );\nequilibrium { formulation gammaPhi; liquid { activityModel ideal; standardState pureLiquid; } vapour { fugacityModel idealGas; } }\n' > "$1/constant/thermoPhysPropDict"; fi
}
for pair in Na-Cl K-Cl; do
    c="${pair%-*}"; a="${pair#*-}"
    mk "$P/p2_$pair" "{ name k; type pitzerActivity; cation $c; anion $a; molality { from 1; to 1; n 2; } output { file k.csv; } }"
    ( cd "$P/p2_$pair" && "$REPO/choupoProps" . > log 2>&1 )
    printf 'P2\t%s record declares\t%s\n' "$pair" "$(grep -m1 '^tCorrelationForm' "$REPO/data/standards/parameters/Pitzer/pairs/$pair.dat")"
    printf 'P2\t%s engine announces\t%s\n' "$pair" "$(grep -m1 'tCorrelationForm not declared' "$P/p2_$pair/log" | sed 's/^ *//')"
done

# --- P3: CaCl2 (no T-extension in its Pitzer record) at 100 C, three routes --
AQ_HMW='recordType thermophysicalPropertySystem;
schemaVersion 2;
components ( water );
aqueousProperties { activityCoefficients { model PitzerHMW; referenceBasis aqueousMolality; } }'
pkg() { printf 'recordType thermophysicalPropertySystem;\nschemaVersion 2;\ncomponents ( water CaCl2 );\nequilibrium { formulation electrolyteGammaPhi; aqueous { activityModel { model %s; } compositionBasis molality; } vapour { fugacityModel idealGas; } }\ncaloric { energyBasis elementsDatum; aqueous { enthalpyRoute ionicReferencePlusExcess; } vapour { enthalpyRoute idealGasCp; } }\n' "$1"; }
mk "$P/p3_hmw" '{ name h; type speciate; activityModel pitzerHMW; temperature 373.15; analyticalTotals { Ca 3 mol/kg; Cl 6 mol/kg; } pH 7.0; networkScope restricted; network ( water-dissociation ); reason "probe"; diagMeanIonic ( { cation Ca; anion Cl; } ); output { file h.csv; } }' "$AQ_HMW"
mk "$P/p3_op"  '{ name k; type pitzerActivity; cation Ca; anion Cl; temperature 373.15; molality { from 3; to 3; n 2; } output { file k.csv; } }'
mk "$P/p3_pkgPitzer" '{ name k; type electrolyteActivity; temperature 373.15; molality { from 3; to 3; n 2; } output { file k.csv; } }' "$(pkg Pitzer)"
mk "$P/p3_pkgENRTL"  '{ name k; type electrolyteActivity; temperature 373.15; molality { from 3; to 3; n 2; } output { file k.csv; } }' "$(pkg eNRTL)"
for r in p3_hmw p3_op p3_pkgPitzer p3_pkgENRTL; do
    ( cd "$P/$r" && "$REPO/choupoProps" . > log 2>&1 )
    n=$(sed -n '/^ASSUMPTIONS AND CAVEATS/,/^-----/p' "$P/$r/log" | grep -ciE 'NO temperature extension|frozen 25 C surface|EXTRAPOLATED' || true)
    printf 'P3\t%s caveat lines about the frozen 25 C surface\t%s\n' "$r" "$n"
done
printf 'P3\tpkgPitzer CaCl2 3 m 373.15 K (m,gamma,phi,a_w)\t%s\n' "$(sed -n 2p "$P/p3_pkgPitzer/k.csv")"
printf 'P3\tpkgENRTL  CaCl2 3 m 373.15 K (m,gamma,phi,a_w)\t%s\n' "$(sed -n 2p "$P/p3_pkgENRTL/k.csv")"
printf 'P3\tHMW gamma_pm CaCl2 3 m 373.15 K\t%s\n' "$(grep -o '"gamma_pm_Ca_Cl": [0-9.e-]*' "$P/p3_hmw/log")"

# --- P4: the composite route on NaCl in water + ethanol + 1-butanol ----------
cp -r "$REPO/tutorials/steady/flash/marcilla01_lls_tie_triangle" "$P/marcilla01"
( cd "$P/marcilla01" && timeout 600 "$REPO/choupoSolve" . > log 2>&1 ) || true
printf 'P4\tresolver line\t%s\n' "$(grep -m1 '\[resolver\] ions' "$P/marcilla01/log" | sed 's/^ *//')"
printf 'P4\tDavies band caveat\t%s\n' "$(sed -n '/^ASSUMPTIONS AND CAVEATS/,/^-----/p' "$P/marcilla01/log" | grep -m1 'Davies activity' | sed 's/^ *//')"

# --- P5: the segment mixed-solvent eNRTL against Esteso (the shipped case) ---
cp -r "$REPO/tutorials/props/electrolyte/enrtl_mixed_nacl_ethanol_esteso" "$P/esteso"
( cd "$P/esteso" && "$REPO/choupoProps" . > log 2>&1 )
for k in AAD_total_pct AAD_wt0_pct AAD_wt20_pct AAD_wt40_pct AAD_wt60_pct AAD_wt80_pct AAD_wt90_pct; do
    printf 'P5\tenrtlMixedSolvent vs Esteso %s\t%s\n' "$k" "$(grep -oE "\"$k\": [0-9.e-]+" "$P/esteso/log" | awk '{print $2}')"
done

# --- P6: the HMW self-check prints a phi oracle that no gate reads -----------
mk "$P/p6" '{ name v; type speciate; verifyGlobal true; activityModel pitzerHMW; analyticalTotals { Na 1 mol/kg; Cl 1 mol/kg; } pH 7.0; networkScope restricted; network ( water-dissociation ); reason "probe"; output { file v.csv; } }' "$AQ_HMW"
sed -i 's/verbosity 1/verbosity 3/' "$P/p6/system/controlDict"
( cd "$P/p6" && "$REPO/choupoProps" . > log 2>&1 )
printf 'P6\tgamma oracle\t%s\n' "$(grep -m1 'single-salt oracle (gamma)' "$P/p6/log" | sed 's/^ *//')"
printf 'P6\tphi oracle\t%s\n' "$(grep -m1 'single-salt oracle (phi' "$P/p6/log" | sed 's/^ *//')"
printf 'P6\tgated value\t%s\n' "$(grep -m1 'verifyGlobal' "$P/p6/log" | sed 's/^ *//')"

# --- P7: the selector spelling the headers document -------------------------
mk "$P/p7" '{ name k; type electrolyteActivity; molality { from 1; to 1; n 2; } output { file k.csv; } }' \
   "$(pkg Pitzer | sed 's/components ( water CaCl2 )/components ( water NaCl )/; s/model Pitzer;/model pitzer;/')"
rc=0; ( cd "$P/p7" && "$REPO/choupoProps" . > log 2>&1 ) || rc=$?
printf 'P7\t`model pitzer;` exit code\t%s\n' "$rc"
printf 'P7\tmessage\t%s\n' "$(grep -m1 'fatal' "$P/p7/log")"
