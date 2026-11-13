#!/bin/bash
# probe_sealed_solution.sh <repo root> <scratch dir>
# The seal's mirror constant/parameters/solution/NaOH-water.dat of the two
# caustic demonstrations is matched by .gitignore's `**/solution/` and is not
# in git; on a checkout of the branch both cases refuse.
set -u
R=$(cd "$1" && pwd); S=$(mkdir -p "$2" && cd "$2" && pwd)/sealed_solution
rm -rf "$S"; mkdir -p "$S"
cd "$R"
for c in liquidDensity03_NaOH liquidDensity04_NaOHpoint; do
  f=tutorials/steady/thermo/$c/constant/parameters/solution/NaOH-water.dat
  echo "== $c"
  echo "  manifest names it: $(grep -c 'parameters/solution/NaOH-water.dat' tutorials/steady/thermo/$c/constant/propertyManifest)"
  echo "  in git: $(git ls-files "$f" | wc -l)   ignored by: $(git check-ignore -v "$f")"
  cp -r tutorials/steady/thermo/$c "$S/$c"
  CHOUPO_HOME="$R" "$R/choupoSolve" "$S/$c" > "$S/$c.log" 2>&1; echo "  exit $?"
  grep '^ERROR' "$S/$c.log" | cut -c1-200
done
