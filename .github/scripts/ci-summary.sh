#!/usr/bin/env bash
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
#  ci-summary.sh <log>
#
#  Copies the suite's own verdict lines into the run's step summary, so the
#  tally is readable without opening the log.  Reads the log; judges nothing
#  (the step that ran bin/runTests already decided pass or fail by its exit
#  status).
log="${1:?usage: ci-summary.sh <log>}"
out="${GITHUB_STEP_SUMMARY:-/dev/stdout}"
{
  echo "### bin/runTests"
  if [ ! -s "$log" ]; then
    echo "No log was written (the run stopped before the suite started)."
  else
    echo '```'
    grep -E '^(PASS [0-9]+ / FAIL|ABORTED|check_workspace_truth|check_build_fresh)' "$log" | cut -c1-220 | head -5
    grep -E '^(FAIL|KNOWN-BROKEN|\s+- )' "$log" | head -40
    grep -E '^\[fast set\]' "$log" | head -1
    echo '```'
  fi
} >> "$out"
exit 0
