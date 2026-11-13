#!/usr/bin/env bash
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
#  sanitize-report.sh <dir> [<dir> ...]
#
#  Turns the ASan/UBSan output a sanitized `bin/runTests` left in the given
#  directories (the log_path files AND, because GCC's libubsan was measured
#  on 2026-11-09 to ignore log_path and print to stderr, the suite's own log
#  and per-case outputs) into one list: each DISTINCT finding with its count, and the first
#  source frame it names.  Reads only; used by sanitize.yml and by a developer
#  reproducing the weekly job locally.
[ "$#" -ge 1 ] || { echo "usage: sanitize-report.sh <dir> [<dir> ...]"; exit 2; }
mapfile -t files < <(find "$@" -type f 2>/dev/null)
echo "files scanned: ${#files[@]}"
[ "${#files[@]}" -gt 0 ] || { echo "nothing to scan"; exit 0; }
grep -l -E "runtime error:|ERROR: AddressSanitizer" "${files[@]}" 2>/dev/null | sed 's/^/finding in: /' | head -40

echo
echo "== UBSan: distinct 'runtime error' sites (count, site: message) =="
grep -h "runtime error:" "${files[@]}" 2>/dev/null \
  | sed -E 's/^[[:space:]]+//' | sort | uniq -c | sort -rn | head -60

echo
echo "== ASan: distinct error kinds (count) =="
grep -h "ERROR: AddressSanitizer" "${files[@]}" 2>/dev/null \
  | sed -E 's/==[0-9]+==//; s/0x[0-9a-f]+/0x?/g; s/(on address|at pc|bp|sp).*//' \
  | sort | uniq -c | sort -rn | head -30

echo
echo "== ASan: first frame in Choupo code, per error (count) =="
grep -h -A8 "ERROR: AddressSanitizer" "${files[@]}" 2>/dev/null \
  | grep -m400 -E "#[0-9]+ .* in .*(src/|choupo)" \
  | sed -E 's/^[[:space:]]*#[0-9]+ 0x[0-9a-f]+ //' | sort | uniq -c | sort -rn | head -30
exit 0
