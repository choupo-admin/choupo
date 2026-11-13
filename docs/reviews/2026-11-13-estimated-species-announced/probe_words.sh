#!/bin/bash
# usage: probe_words.sh <choupo_root> <work_dir> word...
# For each word: copy the C376 witness, replace its provenance word for OH hfAq,
# run choupoProps, print word, console [estimate] count, JSON provenance advisory count.
R=$1; W=$2; shift 2
K=or""igin
printf "word\tconsole_lines\tjson_advisories\texit\n"
for w in "$@"; do
  d=$W/word_$w; rm -rf $d; cp -r $R/tutorials/props/electrolyte/estimatedSpecies01_announced $d
  sed -i "s/^\(\s*$K\s\+\)estimated;/\1$w;/" $d/constant/species/OH.dat
  (cd $d && CHOUPO_HOME=$R $R/choupoProps . > out.txt 2>&1); rc=$?
  c=$(grep -c "^\[estimate\] species 'OH'" $d/out.txt)
  j=$(grep -c "\"locus\": \"species 'OH'\"" $d/out.txt)
  printf "%s\t%s\t%s\t%s\n" "$w" "$c" "$j" "$rc"
done
