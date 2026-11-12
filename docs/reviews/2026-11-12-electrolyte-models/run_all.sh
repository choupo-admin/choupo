#!/usr/bin/env bash
# Reproduce every number of this review.
#   run_all.sh <repo_root> [work_dir]
# Needs a native build of <repo_root> (make all).  Writes probe cases into
# work_dir (default: a fresh mktemp dir, OUTSIDE the tree) and the .tsv tables
# next to this script.  Changes no tracked file.
set -euo pipefail
REPO="$(cd "${1:?usage: run_all.sh <repo_root> [work_dir]}" && pwd)"
WORK="${2:-$(mktemp -d)}"
REV="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export CHOUPO_HOME="$REPO"
export PYTHONDONTWRITEBYTECODE=1
mkdir -p "$WORK"
CASES="$WORK/cases"
rm -rf "$CASES"
python3 "$REV/gen_cases.py" "$REPO" "$CASES"

# kernel probe compiled against the engine's own header-only eNRTL kernels
g++ -std=c++17 -O2 -Wall -I "$REPO/src" -o "$CASES/enrtl_probe" "$REV/enrtl_kernel_probe.cpp"

status="$REV/run_status.tsv"
printf 'case\texit\tlast_error_line\n' > "$status"
for c in "$CASES"/*/; do
    c="${c%/}"
    [ -f "$c/system/propsDict" ] || continue
    rc=0
    ( cd "$c" && "$REPO/choupoProps" . > log 2>&1 ) || rc=$?
    err="$(grep -m1 -iE 'error|refus|what\(\)' "$c/log" | tr '\t' ' ' | cut -c1-300 || true)"
    printf '%s\t%s\t%s\n' "$(basename "$c")" "$rc" "$err" >> "$status"
done

# what each run announced (its end-of-run caveat block), one row per line
ann="$REV/announcements.tsv"
printf 'case\tcaveat_line\n' > "$ann"
for c in "$CASES"/*/; do
    c="${c%/}"; [ -f "$c/log" ] || continue
    sed -n '/^ASSUMPTIONS AND CAVEATS/,/^-----/p' "$c/log" | { grep -E '^\s+- |none raised' || true; } \
      | sed 's/^ *//' | sort -u | sed "s#^#$(basename "$c")\t#" >> "$ann"
done

python3 "$REV/collect.py" "$REPO" "$CASES" "$REV"

# item 5: the two mixed-solvent eNRTL kernels (the composite route is probed
# in finding_probes.sh)
VANTI="$(python3 - "$REPO" <<'EOF'
import re, sys
t = open(sys.argv[1] + "/data/standards/components/ethanol.dat").read()
m = re.search(r"\bVliq\s+([-0-9.eE]+)", t)
print(m.group(1) if m else "5.84e-5")
EOF
)"
export VANTI
{
  # Esteso compositions: salt-free ethanol mole fractions for 20/40/60 wt%,
  # and Esteso's mixed-solvent A_phi as the shipped case declares them.
  for row in "0.0890 0.4878" "0.2068 0.6434" "0.3698 0.8962"; do
      set -- $row
      "$CASES/enrtl_probe" mixed "$1" "$2" 0.1 0.5 1.0
  done
} | awk 'NR==1 || $1!="yAlc"' > "$REV/item5_mixed_solvent_kernels.tsv"

bash "$REV/coverage.sh" "$REPO" > "$REV/item6_coverage_counts.tsv"
echo "done: tables in $REV, cases in $CASES"

# the observations behind findings.tsv
bash "$REV/finding_probes.sh" "$REPO" "$WORK" > "$REV/finding_probes.tsv"
echo "probes: $REV/finding_probes.tsv"
