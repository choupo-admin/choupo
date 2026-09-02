#!/usr/bin/env python3
"""ONE home for "this gate needs something that is not here".

    from gate_prereq import require_solver
    require_solver(SOLVER)

A CHECK THAT CANNOT RUN MUST NOT PASS.  The rule is old here (2026-08-05:
`bin/buildSite` WARNed and published without poppler, so the guide-version
gate never ran in CI, the only place that publishes; and `check_true_ions`
reported PASS on every run while both its inputs had been deleted, which is
why it was retired rather than repaired).

Six gates carried the same escape, in the same three lines:

    if not os.path.exists(SOLVER):
        print("SKIP  no choupoSolve binary -- build first (make)")
        sys.exit(0)

WHAT THAT COSTS, precisely.  Inside `bin/runTests` the branch is LATENT and
not live: `check_build_fresh` aborts the whole suite before any gate runs if
the binaries are missing or stale, so the suite never reaches it.  It is
reachable two other ways, and both matter -- a developer running one gate in
a fresh clone reads exit 0 as a verdict, and `gate_manifest.py` runs every
gate and records ITS OWN OK LINE as what that gate claims.  A manifest built
over an unbuilt tree would record "SKIP no choupoSolve binary" as six gates'
account of themselves, which answers "what does this project check?" wrongly,
with authority -- the 2026-08-18 lesson one layer over.

So the message is spelled ONCE, here, and the six call sites name it.  Six
transcriptions of one refusal is the arity sin inside the machinery built to
enforce it.

WHAT THIS IS NOT.  It is not a build check.  `check_build_fresh` owns the
harder question -- whether the binary that EXISTS is a build of THIS tree --
and this helper deliberately does not duplicate it: a present-but-stale
binary passes here and is caught there.  All this says is that the thing the
gate is about to run exists.

    Copyright (C) 2026 Vítor Geraldes
    Licence: GPL-3.0-or-later
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
"""
import os
import sys


def require_solver(path, what="choupoSolve"):
    """Refuse, by name, when the binary this gate drives is not on disk.

    Exits 1 rather than returning, because every caller's next statement
    assumes the binary is there.
    """
    if os.path.exists(path):
        return
    name = os.path.basename(sys.argv[0]) or "gate"
    sys.stdout.write(
        f"{name}: FAILED\n"
        f"  {what} does not exist at {path}, so this gate CANNOT RUN.\n"
        "  It refuses rather than reporting SKIP and exiting 0: to bin/runTests\n"
        "  and to gate_manifest, exit 0 is a PASS, and nothing here has been\n"
        "  verified either way.\n"
        "  remedy: make all\n")
    sys.exit(1)
