#!/usr/bin/env bash
# Runs every probe of this review into <scratchDir>/<tag>/ and prints a one-line
# summary per probe (tab-separated) -- run it twice with two tags to reproduce.
# Run from the repository root after `make all`:
#     bash docs/reviews/2026-11-12-solid-properties/run_all_probes.sh <scratchDir> <tag>
set -u
OUT=${1:?scratch dir}/${2:?tag}; mkdir -p "$OUT"; H=docs/reviews/2026-11-12-solid-properties
bash $H/probe_mill_datum.sh            "$OUT/mill" > "$OUT/mill.txt" 2>&1
bash $H/probe_two_solids_mixer.sh      "$OUT/mix"  > "$OUT/mix.txt"  2>&1
bash $H/probe_cyclone_two_solids.sh    "$OUT/cyc"  > "$OUT/cyc.txt"  2>&1
bash $H/probe_spraydryer_density.sh    "$OUT/sd"   > "$OUT/sd.txt"   2>&1
bash $H/probe_crystalliser_kv.sh       "$OUT/kv"   > "$OUT/kv.txt"   2>&1
bash $H/probe_gab_missing_constant.sh  "$OUT/gab"  > "$OUT/gab.txt"  2>&1
bash $H/probe_solid_above_melting.sh   "$OUT/hot"  > "$OUT/hot.txt"  2>&1
g() { grep -oE "$2" "$OUT/$1" | tr '\n' ' '; }
printf 'mill\t%s\n' "$(g mill.txt '== [a-zA-Z]+ exit [0-9]|T_out: +[0-9.]+|needs [a-zA-Z]+')"
printf 'mix\t%s\n'  "$(g mix.txt 'exit [0-9]|T_out: +[0-9.]+|liquid inlets merged')"
printf 'cyc\t%s\n'  "$(g cyc.txt '== [a-zA-Z]+ exit [0-9]|rho_particle\": [0-9.]+|d50_micron\": [0-9.]+')"
printf 'sd\t%s\n'   "$(g sd.txt '== [a-zA-Z]+ exit [0-9]|d_particle_micron\": [0-9.]+')"
printf 'kv\t%s\n'   "$(g kv.txt '== [a-zA-Z]+ exit [0-9]|L_dominant\": [0-9.e-]+')"
printf 'gab\t%s\n'  "$(grep -oE '== [a-zA-Z]+ exit [0-9]' "$OUT/gab.txt" | tr '\n' ' ') $(for v in base noC; do grep -oE '"X_(final|equilibrium_inlet_air)": [0-9.e-]+' "$OUT/gab/gab_$v/run.log" | head -2 | tr '\n' ' '; done)"
printf 'hot\t%s\n'  "$(g hot.txt 'exit [0-9]|T_out: +[0-9.]+|LEAVES its declared Trange|melt')"
