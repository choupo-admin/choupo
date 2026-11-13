#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""PreToolUse hook (Bash): refuse `git add -A`, `git add --all` and `git add .`.

CLAUDE.md section 2: "Never `git add -A`.  Stage explicitly per file."  The
rule was prose; DEV.md 4c C242 moves checkable rules into hooks.  Exit 2
blocks the call and hands the reason back to the model; anything else lets
the call through.  The hook reads the tool input as JSON on stdin.
"""
import json, re, sys

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
cmd = (data.get("tool_input") or {}).get("command", "")
pattern = r"\bgit\s+add\s+(?:[^\n;&|]*\s)?(?:-A\b|--all\b|\.(?:\s|$|;|&|\|))"
if re.search(pattern, cmd):
    sys.stderr.write(
        "Refused by .claude/hooks/refuse_git_add_all.py: `git add -A`/`--all`/`git add .` "
        "stages run outputs and unreviewed edits (CLAUDE.md section 2).  Stage per file.\n")
    sys.exit(2)
sys.exit(0)
