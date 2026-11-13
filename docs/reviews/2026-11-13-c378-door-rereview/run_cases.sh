#!/bin/bash
# Run cases on COPIES in a scratch directory and print each run's liquid-
# property table (the block between "[liquid properties]" and the result).
#   usage: bash run_cases.sh <built checkout> <scratch dir> <case list file>
#   case list: one case path per line, relative to the checkout
# Nothing is written inside the checkout.
set -u
TREE="$1"; OUT="$2"; LIST="$3"
mkdir -p "$OUT"
while read -r c; do
  [ -z "$c" ] && continue
  n=$(basename "$c"); rm -rf "$OUT/$n"; cp -r "$TREE/$c" "$OUT/$n"
  app=$(grep -E '^\s*application' "$OUT/$n/system/controlDict" | awk '{print $2}' | tr -d ';')
  ( cd "$OUT/$n" && CHOUPO_HOME="$TREE" timeout 900 "$TREE/$app" . > "$OUT/$n.log" 2>&1 )
  echo "=== $n (exit $?)  propertySources blocks: $(grep -c '"propertySources"' "$OUT/$n.log")"
  sed -n '/^\[liquid properties\]/,/<<<Choupo:result-begin>>>/p' "$OUT/$n.log" | grep -v '<<<'
done < "$LIST"
