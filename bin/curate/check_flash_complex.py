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
"""check_flash_complex -- the design-driver case must keep closing.

flashComplex is the case the architecture was written to serve: vapour + a
speciated aqueous liquid + a declared organic liquid + growing calcite, all
at once, with an inert on the Henry rung.  It was authored FIRST, as a
specification, and the engine was built toward it in slices.

On 2026-07-30 it started closing.  Nothing watched it.

That is the gap this fills, and the reason is not sentiment.  The case lives
in `docs/design/`, not `tutorials/`, because sealing it is an unresolved
CURATION question (ten component records differ from the catalogue in real
data -- see its README).  So `bin/runTests` never runs it, and the single
most demanding thing the solver does had no regression signal at all: every
slice of the phase work could break it and the suite would stay green.

WHAT IS ASSERTED, and each is a way it has actually failed or could:

  1. It RUNS -- exit 0.  Not "does not crash": a reactive non-convergence
     throws, so exit 0 is a real statement about the joint Newton.
  2. FOUR PHASES, named in the bottoms stream: aqueous (carrying the
     speciation), organic, solid.  A silent collapse to fewer phases still
     converges and still exits 0 -- it just answers a different problem.
  3. The joint residual is TIGHT.  The outer Newton's FD Jacobian makes a
     loosely-converged inner solve look like noise, so a slack tolerance is
     how this case degrades without failing.
  4. The organic and the precipitate are REAL, not vestigial.  A phase
     holding nothing satisfies (2) while proving nothing.

NOT pinned: the exact V/F, pH or mineral amount.  Those are physics that may
legitimately move when a model improves, and pinning them here would turn a
structural guard into a second golden master with no `--record` to refresh
it.  What is pinned is that the phases exist, are populated, and close.
"""

import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gate_prereq import require_solver

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CASE = os.path.join(ROOT, "docs", "design", "flashComplex")
SOLVER = os.path.join(ROOT, "choupoSolve")

fails = []


def fail(msg):
    fails.append(msg)
    print("FAIL  " + msg)


def ok(msg):
    print("  ok   " + msg)


#  A CHECK THAT CANNOT RUN MUST NOT PASS.  This used to print SKIP and exit
#  0 -- see bin/curate/gate_prereq.py for what that cost and where it is
#  latent (inside the suite) versus live (standalone, and gate_manifest).
require_solver(SOLVER)
if not os.path.isdir(CASE):
    fail("docs/design/flashComplex is gone -- the design-driver case has no "
         "regression signal and neither does the architecture it drove")
    sys.exit(1)

#  CHOUPO_HOME so the catalogue is reachable: the case is NOT sealed (that is
#  the open curation question), so it reads the installation tree.
env = dict(os.environ, CHOUPO_HOME=ROOT)
r = subprocess.run([SOLVER, CASE], capture_output=True, text=True, env=env)
out = (r.stdout or "") + (r.stderr or "")

if r.returncode != 0:
    tail = "\n".join(out.strip().splitlines()[-6:])
    fail("flashComplex does NOT run (exit %d).  The design-driver case is the "
         "hardest thing the solver does; when it stops closing, the phase "
         "architecture has regressed even if every tutorial is green.\n%s"
         % (r.returncode, tail))
    print("\n%d failure(s)." % len(fails))
    sys.exit(1)
ok("flashComplex runs (exit 0 -- a reactive non-convergence throws, so this "
   "is a statement about the joint Newton, not about not crashing)")

#  ---- the joint residual --------------------------------------------------
m = re.search(r"\|r\|max\(joint\)\s*=\s*([-\d.eE+]+)", out)
if not m:
    fail("flashComplex prints no joint residual -- the one number that says "
         "the phase equilibria and the speciation closures hold TOGETHER")
else:
    res = float(m.group(1))
    #  Loose enough to survive an honest model change, tight enough that a
    #  slack inner solve -- which reads as noise under the outer FD Jacobian
    #  -- cannot hide behind it.
    if res > 1.0e-9:
        fail("flashComplex's joint residual is %.2e (was 4.6e-13).  The outer "
             "Newton differentiates the inner solve, so a slack inner "
             "tolerance degrades this case without failing it" % res)
    else:
        ok("joint residual %.1e -- phase equilibria and speciation closures "
           "hold together" % res)

#  ---- four phases, named, populated ---------------------------------------
BOTTOMS = os.path.join(CASE, "converged", "bottoms")
if not os.path.exists(BOTTOMS):
    fail("flashComplex wrote no converged/bottoms")
else:
    body = open(BOTTOMS).read()
    NUM = re.compile(r"(\w+)\s+([-\d.eE+]+)\s+kmol/h;")

    def phase(name):
        m = re.search(r"\n    %s\n    \{\n(.*?)\n    \}\n" % name, body, re.S)
        if not m:
            return None
        return {k: float(v) for k, v in
                NUM.findall(m.group(1).split("speciation")[0])}

    got = {p: phase(p) for p in ("aqueous", "organic", "solid")}
    missing = [p for p, v in got.items() if v is None]
    if missing:
        fail("flashComplex's bottoms does not name %s.  A collapse to fewer "
             "phases converges and exits 0 -- it just answers a different "
             "problem" % ", ".join(missing))
    else:
        #  ...and each must hold something.  A declared-but-empty phase
        #  satisfies the naming check while proving nothing about the split.
        empty = [p for p, v in got.items() if sum(v.values()) <= 0.0]
        if empty:
            fail("flashComplex's %s phase(s) hold NOTHING -- named but "
                 "vestigial, which passes a structural check and proves no "
                 "physics" % ", ".join(empty))
        else:
            liq = sum(got["aqueous"].values()) + sum(got["organic"].values())
            ok("four phases: vapour + aqueous + organic (%.1f %% of the "
               "liquid) + solid (%.4g kmol/h)"
               % (sum(got["organic"].values()) / liq * 100.0,
                  sum(got["solid"].values())))

    if "speciation" not in body:
        fail("flashComplex's bottoms carries no speciation -- the aqueous "
             "chemistry that makes this the design-driver case")
    elif re.search(r"^speciation$", body, re.M):
        fail("flashComplex's speciation is at the TOP LEVEL again, beside a "
             "phases{} that names an aqueous phase: it would be checked "
             "against the organic and the crystals too")
    else:
        ok("the speciation lives inside the aqueous phase")

print()
if fails:
    print("%d failure(s)." % len(fails))
    sys.exit(1)
print("flashComplex gate: the design-driver case still closes -- four phases "
      "at once, jointly, each of them real.")
sys.exit(0)
