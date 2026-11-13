#!/bin/bash
# DR-07 reproduction: a pipe whose Friedel model reads a DECLARED surface
# tension prints no surface-tension line.
#   usage: TREE=<built checkout> OUT=<scratch dir> bash probe_friedel_sigma.sh
set -u
: "${TREE:?}"; : "${OUT:?}"
rm -rf "$OUT/probeFriedel"; mkdir -p "$OUT"
cp -r "$TREE/tutorials/steady/hydraulics/pipe02_airwater_twophase" "$OUT/probeFriedel"
sed -i 's/model  LockhartMartinelli;.*/model Friedel; surfaceTension 0.072;/' "$OUT/probeFriedel/system/flowsheetDict"
( cd "$OUT/probeFriedel" && CHOUPO_HOME="$TREE" "$TREE/build/linux64Gcc/choupoSolve" . > "$OUT/probeFriedel.log" 2>&1 )
grep -m1 'Model:' "$OUT/probeFriedel.log"
sed -n '/^\[liquid properties\]/,/<<<Choupo:result-begin>>>/p' "$OUT/probeFriedel.log" | grep -v '<<<'
