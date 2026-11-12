#!/usr/bin/env bash
# Re-run C329 tray cases at chosen F-factors, outside the tree.
#
# HOW TO RUN (from the repository root, after `make all`):
#     docs/reviews/2026-11-12-rate-based-columns/run_points.sh [WORKDIR]
# WORKDIR defaults to a fresh mktemp directory.  Nothing under tutorials/ is
# touched: each case is COPIED, its outerDict (the sweep) removed so the run
# is one point, and its `fFactor` set by sed.  Prints the overall tray
# efficiency (the Fenske slope) or the engine's refusal for each point.
#
# What it reproduces (finding RB-01 of findings.tsv): at 34 kPa on
# the 14 % tray the engine RUNS at F_s 2.305 and 2.356 -- the two highest
# measured loads, one of them the tabulated run 625 -- and refuses
# (Fair psi >= 1) only from about 2.40.
set -u
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
WORK="${1:-$(mktemp -d)}"
mkdir -p "$WORK"
source "$ROOT/etc/bashrc"
for base in trayEfficiency01_yanagi14 trayEfficiency05_chanFair_yanagi14 trayEfficiency06_syedaChuang_yanagi14; do
  for F in 1.47 2.305 2.356 2.40; do
    d="$WORK/${base}_F$F"
    rm -rf "$d"; cp -r "$ROOT/tutorials/steady/distillation/$base" "$d"
    rm -f "$d/system/outerDict" "$d"/log.*; rm -rf "$d/converged" "$d/reports"
    sed -i "s|fFactor        [0-9.]*;|fFactor        $F;|" "$d/system/flowsheetDict"
    (cd "$d" && runCase . > run.log 2>&1)
    printf '%s\tFs=%s\t' "$base" "$F"
    grep -hE "Overall tray efficiency|^ERROR" "$d/log.choupoSolve" | head -1
  done
done
