#!/bin/bash
# usage: sabotage.sh <repo-root> <scratch-dir> apply|restore [A B C D]
repo=$1; out=$2; act=$3; shift 3
cd "$repo" || exit 9
A=data/standards/parameters/NRTL/1122Tetrachloroethane-1Hexanol.dat
B=data/standards/components/1122Tetrachloroethane.dat
C1=tutorials/props/curation/curate12_nrtl_ethanol_cyclohexane/constant/parameters/NRTL/cyclohexane-ethanol.dat
C2=tutorials/steady/flash/vlle04_two_liquids_decanter/constant/parameters/NRTL/cyclohexane-ethanol.dat
D=tutorials/props/curation/curate12_nrtl_ethanol_cyclohexane/constant/r5dangling
if [ "$act" = restore ]; then git checkout -- $A $B $C1 $C2; rm -f $D; git status --short; exit 0; fi
for s in "$@"; do case $s in
 A) sed -i 's/^    b_ij        -359.16528436;/    b_ij        -359.26528436;/' $A ;;
 B) sed -i 's/coefficients  (4.239650499 /coefficients  (4.249650499 /' $B ;;
 C) sed -i 's/^        aad_pct     0.093962;/        aad_pct     0.093999;/' $C1
    sed -i 's/^        aad_pct     0.093962;/        aad_pct     0.094111;/' $C2 ;;
 D) ln -sfn /nonexistent/r5 $D ;;
esac; done
git diff --stat; ls -l $D 2>/dev/null
true
