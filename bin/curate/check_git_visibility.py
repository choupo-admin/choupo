#!/usr/bin/env python3
# =============================================================================
#        \|/       C hemicals     | Open-source, glass-box chemical process simulator
#       \\|//      H eat-transfer | https://choupo.org
#      \\\|///     O perations    |
#       \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
#        \|/       P roperties    | Licence: GPL-3.0-or-later
#         |        O ptimization  |
#        /|\                      |
# -----------------------------------------------------------------------------
#     SPDX-License-Identifier: GPL-3.0-or-later
#     Credit and attribution: see AUTHORS
#     Required legal notices:  see NOTICE
# =============================================================================
"""check_git_visibility -- a new source file must not be invisible to git.

THE BUG THIS GUARDS.  .gitignore carries broad case-output rules --
`**/postProcessing/` for the report tree, `**/solution/` for the retired
Slice-0 wrapper -- and a rule written with `**/` matches a directory ANYWHERE,
including under src/.  Two source directories were caught by them:

    src/thermo/solution/      SolutionPair / SolutionRegistry
    src/postProcessing/       SizingPass / CostingPass

Their existing files are TRACKED, so nothing looked wrong: `git status` shows
them, `git diff` shows them, the build uses them.  But a NEW file added there
would never appear in `git status` -- and this project forbids `git add -A`
(CLAUDE.md sec.2), so the only way a file gets committed is by being named,
and the only way it gets named is by being seen.  It would simply never be
committed, and the omission would surface as a broken build on someone else's
clone.

Both were found by accident, while `git add` refused a pathspec.  This finds
them on purpose: probe every directory under src/ and bin/ with the name of a
file that does not exist, and ask git whether it would ignore it.

Exit 0 = every source directory can hold a new file.  Exit 1 = one cannot.
"""

import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PROBE = "__choupo_visibility_probe__.cpp"

dirs = []
for base in ("src", "bin"):
    root = os.path.join(ROOT, base)
    if not os.path.isdir(root):
        continue
    for d, subs, _files in os.walk(root):
        subs[:] = [s for s in subs if s != "__pycache__"]
        dirs.append(os.path.relpath(d, ROOT))

probes = [os.path.join(d, PROBE) for d in dirs]
r = subprocess.run(["git", "check-ignore", "-v", "--no-index", "--stdin"],
                   input="\n".join(probes), capture_output=True, text=True,
                   cwd=ROOT)

hidden = {}
for line in r.stdout.splitlines():
    if "\t" not in line:
        continue
    rule, path = line.split("\t", 1)
    #  A NEGATION (!...) is the fix, not the defect: git reports the rule that
    #  decided, and when that rule un-ignores the path the file is visible.
    if ":!" in rule or rule.rstrip().split(":")[-1].startswith("!"):
        continue
    hidden[os.path.dirname(path)] = rule

for d, rule in sorted(hidden.items()):
    print("FAIL  a new file in %s/ would be INVISIBLE to git -- %s.  This "
          "project stages explicitly (never `git add -A`), so an invisible "
          "file is a file that never gets committed.  Add a negation to "
          ".gitignore." % (d, rule))

print()
if hidden:
    print("%d source directory/ies cannot hold a new file." % len(hidden))
    sys.exit(1)
print("git visibility: %d source directories, each can hold a new file." % len(dirs))
sys.exit(0)
