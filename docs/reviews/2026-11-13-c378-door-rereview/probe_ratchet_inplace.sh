#!/bin/bash
# DR-09 re-check: append ONE probe line at a time to a unit source file of a
# checkout, run check_liquid_property_ratchet, record caught / not_caught,
# restore the file with `git checkout --`.  The gate reads source only, so
# no build is needed for the verdict; the restore changes the file's clock,
# so run `make all` before any bin/runTests afterwards.
#   usage: bash probe_ratchet_inplace.sh <checkout> <file relative to checkout> <probes.tsv>
#   probes.tsv: id<TAB>line, one probe per row (a literal \n in a line is a line break)
set -u
TREE="$1"; F="$2"; P="$3"
cd "$TREE" || exit 2
git diff --quiet -- "$F" || { echo "refusing: $F has local changes" >&2; exit 2; }
printf 'probe\tresult\tgate_first_line\tline\n'
while IFS=$'\t' read -r k line; do
  [ -z "$k" ] && continue
  printf '%b\n' "$line" >> "$F"
  out=$(python3 -I bin/curate/check_liquid_property_ratchet.py 2>&1 | head -1)
  git checkout -q -- "$F"
  case "$out" in *FAIL*) r=caught;; *OK*) r=not_caught;; *) r=error;; esac
  printf '%s\t%s\t%s\t%s\n' "$k" "$r" "${out:0:90}" "$line"
done < "$P"
