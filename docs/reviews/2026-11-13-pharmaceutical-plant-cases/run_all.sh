#!/usr/bin/env bash
# Review of the three pharmaceutical drug-product plant cases (2026-11-13).
#
# HOW TO RUN
#     bash docs/reviews/2026-11-13-pharmaceutical-plant-cases/run_all.sh <repo-root> [work-dir]
#
#   <repo-root>  a built Choupo checkout (`make all` done; etc/bashrc present).
#   [work-dir]   where the case COPIES are run (default: a fresh mktemp -d).
#
# What it does: copies apalutamide01_tablets, donepezil01_tablets and
# donepezil02_two_strengths out of git (HEAD) into the work dir, runs each with
# `runCase`, then runs the two independent recomputation scripts and writes
# their TSV output next to this script.  It changes no tracked file and runs
# no gate and no sabotage (those were done by hand; see sabotage.tsv).
set -euo pipefail
REPO=$(cd "${1:?usage: run_all.sh <repo-root> [work-dir]}" && pwd)
WORK=${2:-$(mktemp -d)}
mkdir -p "$WORK"
HERE=$(cd "$(dirname "$0")" && pwd)
cd "$REPO"
# shellcheck disable=SC1091
source etc/bashrc
for c in apalutamide01_tablets donepezil01_tablets donepezil02_two_strengths; do
    git archive HEAD "tutorials/batch/plant/$c" | tar -x -C "$WORK" --strip-components=3
    runCase -f "$WORK/$c" > "$WORK/$c.runCase.out" 2>&1
    echo "ran $c -> $WORK/$c (exit $?)"
done
python3 -I "$HERE/recompute_apalutamide.py" "$REPO" "$WORK/apalutamide01_tablets" > "$HERE/recompute_apalutamide.tsv"
CHOUPO_REPO="$REPO" python3 -I "$HERE/recompute_donepezil.py" "$WORK/donepezil01_tablets" "$WORK/donepezil02_two_strengths" > "$HERE/recompute_donepezil.tsv"
echo "wrote $HERE/recompute_apalutamide.tsv and $HERE/recompute_donepezil.tsv"
