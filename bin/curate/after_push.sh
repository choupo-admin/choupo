#!/bin/sh
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
#
# after_push.sh -- run this right after a push to main: it prints the state of
# main's latest CI run, so reading it is not left to memory.
#
#     bin/curate/after_push.sh
#
# THE REAL DEFECT (CLAUDE.md section 10, integration hygiene rule 6): CI was red
# from 2026-11-20 to 11-23 and nobody looked.  A landing is not finished until
# main's CI has been read; red is a backlog item the same day.  It pushes
# nothing and changes nothing; it says when the latest run is for an OLDER
# commit than the one just pushed (the new run has not started yet).
command -v gh >/dev/null 2>&1 || { echo "after_push: gh is not installed; read main's CI by hand."; exit 1; }
echo "main's latest CI run (read it; red is a backlog item today):"
gh run list --branch main --workflow ci --limit 1 \
    --json status,conclusion,headSha,displayTitle,createdAt,url \
    --template '{{range .}}{{.status}} / {{if .conclusion}}{{.conclusion}}{{else}}(no conclusion yet){{end}}  {{slice .headSha 0 10}}  {{.createdAt}}{{"\n"}}  {{.displayTitle}}{{"\n"}}  {{.url}}{{"\n"}}{{end}}' \
    || { echo "after_push: gh could not read the runs (network or login); read main's CI by hand."; exit 1; }
head=$(git rev-parse --short=10 origin/main 2>/dev/null)
[ -n "$head" ] && echo "  origin/main is at $head; if the run above is for another commit, the run for this push has not started yet: run this again in a minute."
exit 0
