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
# =============================================================================
"""check_drill_in -- the drilled sub-case must RUN, not merely be produced.

WHY THIS EXISTS.  bin/choupo-drill had five defects at once and had never
completed on either plant in the corpus.  It had no test of any kind, so each
fault hid the next: a sector layout it did not know, named edges it did not
resolve, a retired grammar it still emitted, a flattened directory that sent
the engine looking for constant/ above the case, and 0/ files written under
the parent's alias while the child's graph used its own names.

Producing output was never the hard part.  Every one of those faults produced
a directory that LOOKED like a drilled case, and four of the five were only
visible when the solver was pointed at it.  So this gate does not inspect what
the tool wrote -- it runs it.

What is asserted:

  1. BOTH LAYOUTS.  A sector directly under the plant (ChemicalPlantTutorial/
     DRYING) and one under sectors/ (lithiumBrinePlant/sectors/BRINE).  The
     second is the plant carrying electrolyte worlds, which is the reason to
     drill in the first place, and it was the one the tool could not find.
  2. IT SOLVES.  Exit 0 from choupoSolve on the drilled case -- the assertion
     the previous four faults would each have broken.
  3. THE ROLE FLIP, which is the whole idea: a stream that is INTERNAL in the
     plant (its producer is another sector) is an INLET in the drilled domain.
     Checked from the tool's own report AND from the child having state for it.
  4. NO SILENT "LATEST".  --from a state directory the parent does not have is
     REFUSED by name.  R3 says the source is explicit and converged/ by
     default, because "latest" is ambiguous exactly where reproducibility
     matters (latest transient?  latest iteration?  latest state before an
     abort?).

Exit 0 = all hold.  Exit 1 = a named failure.
"""

import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DRILL = os.path.join(ROOT, "bin", "choupo-drill")
SOLVER = os.path.join(ROOT, "choupoSolve")

CASES = [
    # plant,                      sector,   layout note
    ("tutorials/plant/ChemicalPlantTutorial", "DRYING", "sector directly under the plant"),
    ("tutorials/plant/lithiumBrinePlant",     "BRINE",  "sector under sectors/ (electrolyte worlds)"),
]

fails = []


def fail(msg):
    fails.append(msg)
    print("FAIL  " + msg)


def ok(msg):
    print("  ok   " + msg)


if not os.path.exists(SOLVER):
    print("SKIP  no choupoSolve binary -- build first (make)")
    sys.exit(0)

tmp = tempfile.mkdtemp(prefix="drillin-")
try:
    for rel, sector, note in CASES:
        plant = os.path.join(ROOT, rel)

        #  The parent must have converged/ -- run it, so this gate does not
        #  depend on who ran what before it.
        r = subprocess.run([SOLVER, plant], capture_output=True, text=True, cwd=ROOT)
        if r.returncode != 0:
            fail("%s did not solve, so there is no converged/ to drill from"
                 % os.path.basename(rel))
            continue

        out = os.path.join(tmp, sector)
        d = subprocess.run([DRILL, plant, sector, out, "--from", "converged"],
                           capture_output=True, text=True, cwd=ROOT)
        if d.returncode != 0:
            fail("drill of %s/%s (%s) failed: %s"
                 % (os.path.basename(rel), sector, note,
                    (d.stderr + d.stdout).strip().splitlines()[-1:]))
            continue

        # --- 3. the role flip, from the tool's own report --------------------
        m = re.search(r"role flipped to INLET in this domain[^:]*:\s*(.+)", d.stdout)
        flipped = [s.strip() for s in m.group(1).split(",")] if m else []
        if not flipped:
            fail("%s/%s: no stream flipped to INLET -- drill-in that changes no"
                 " role has not restricted the domain" % (os.path.basename(rel), sector))
        else:
            missing = [f for f in flipped
                       if not os.path.exists(os.path.join(out, "0", sector, f))]
            if missing:
                fail("%s/%s: flipped to INLET but no state materialised: %s"
                     % (os.path.basename(rel), sector, ", ".join(missing)))
            else:
                ok("%s/%s (%s): %d stream(s) flipped to INLET and each has state"
                   % (os.path.basename(rel), sector, note, len(flipped)))

        # --- 2. it SOLVES ----------------------------------------------------
        s = subprocess.run([SOLVER, out], capture_output=True, text=True, cwd=ROOT)
        if s.returncode != 0:
            last = [l for l in (s.stdout + s.stderr).splitlines() if "ERROR" in l]
            fail("%s/%s: the drilled case does not SOLVE -- %s"
                 % (os.path.basename(rel), sector,
                    last[-1] if last else "exit %d" % s.returncode))
        else:
            ok("%s/%s: the drilled case solves (exit 0)"
               % (os.path.basename(rel), sector))

    # --- 4. no silent "latest" ----------------------------------------------
    plant = os.path.join(ROOT, CASES[0][0])
    r = subprocess.run([DRILL, plant, CASES[0][1], os.path.join(tmp, "nope"),
                        "--from", "iterations/999999"],
                       capture_output=True, text=True, cwd=ROOT)
    msg = r.stdout + r.stderr
    if r.returncode == 0:
        fail("--from a state the parent does not have was ACCEPTED; R3 refuses"
             " a silent fallback because 'latest' is ambiguous exactly where"
             " reproducibility matters")
    elif "no" not in msg and "missing" not in msg.lower():
        fail("the bad --from was refused but not by name: %s" % msg.strip()[-200:])
    else:
        ok("REFUSED: --from a state the parent does not have (no silent"
           " fallback to 'latest')")
finally:
    shutil.rmtree(tmp, ignore_errors=True)

print()
if fails:
    print("check_drill_in: %d FAILURE(S)" % len(fails))
    sys.exit(1)
print("check_drill_in: all hold")
sys.exit(0)
